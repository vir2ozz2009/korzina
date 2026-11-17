import { DurableObject } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import { Hono } from "hono";
import { shopContract } from "../../src/shared/contracts/shop";
import { shopContextContract } from "../../src/shared/contracts/shop-context";
import { ApiError, errorBody, errorStatus } from "../../src/shared/errors";
import { resolveFeatures } from "../../src/shared/flags";
import type { AuthSecrets } from "../auth/config";
import { RequestMetrics } from "../metrics";
import { handleError, notFound } from "../middleware/errors";
import { seedCatalog } from "../modules/catalog/seed";
import { cleanupSellers, platformCleanupId } from "../platform/cleanup";
import { rescheduleCleanup, scheduleCleanup } from "./cleanup";
import { cleanupShop } from "./maintenance";
import { migrations } from "./migrations";
import { shopRoutes } from "./routes";
import { settings } from "./schema";

export class Shop extends DurableObject<Env> {
  private identity: string | undefined;
  private readonly router = new Hono().onError(handleError).route("/api", shopRoutes()).notFound(notFound);

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      await migrate(drizzle(ctx.storage), migrations);
      if (!ctx.storage.sql.exec("SELECT value FROM settings WHERE key='cleanup_revision'").toArray().length) {
        await rescheduleCleanup(ctx.storage, false);
        ctx.storage.sql.exec("INSERT INTO settings(key,value) VALUES('cleanup_revision','R1')");
      }
      if (
        env.APP_ENV !== "production" &&
        ["korzina-demo-lavka", "korzina-demo-test2"].some((id) => this.ctx.exports.Shop.idFromName(id).equals(ctx.id))
      )
        seedCatalog(ctx.storage);
    });
  }

  async fetch(request: Request): Promise<Response> {
    const metrics = new RequestMetrics();
    const storage = metrics.storage(this.ctx.storage);
    const db = drizzle(storage);
    let response: Response;
    let shopId: string | undefined;
    try {
      const metadata = request.headers.get("x-korzina-shop");
      if (!metadata) throw new ApiError("FORBIDDEN", "Нет магазина");
      const data = JSON.parse(decodeURIComponent(metadata));
      const parsed = shopContract.safeParse(data);
      if (!parsed.success) throw new ApiError("FORBIDDEN", "Нет магазина");
      const shop = parsed.data;
      const context = shopContextContract.shape.features.safeParse(data.features);
      shopId = shop.id;
      if (!this.ctx.exports.Shop.idFromName(shop.id).equals(this.ctx.id))
        throw new ApiError("FORBIDDEN", "Другой магазин");
      // The namespace/id check above runs on EVERY request. The persisted identity is immutable.
      if (!this.identity) {
        const identity = db.select({ value: settings.value }).from(settings).where(eq(settings.key, "shop_id")).get();
        if (identity && identity.value !== shop.id) throw new ApiError("FORBIDDEN", "Другой магазин");
        if (!identity)
          storage.transactionSync(() => db.insert(settings).values({ key: "shop_id", value: shop.id }).run());
        this.identity = shop.id;
      }
      response = await this.router.fetch(request, {
        shop,
        features: context.success ? context.data : resolveFeatures([]),
        db,
        storage,
        secrets: this.env as Env & AuthSecrets,
        platform: this.env.PLATFORM,
        media: this.env,
      });
    } catch (error) {
      const known = error instanceof ApiError ? error : new ApiError("INTERNAL", "Внутренняя ошибка сервера");
      response = Response.json(errorBody(known), { status: errorStatus[known.code] });
    }
    const route =
      this.router.routes.find(
        (route) => route.path === new URL(request.url).pathname && route.method === request.method,
      )?.path ?? "unmatched";
    const metric = metrics.record(
      route,
      shopId,
      request.headers.get("x-request-id") ?? "internal",
      response.status,
      false,
    );
    if (request.method === "POST" && response.ok && metric.rowsWritten > 0) await scheduleCleanup(this.ctx.storage);
    // Only the public Worker can see these; it strips them before returning to the client.
    response.headers.set("x-korzina-sql", JSON.stringify(metric));
    return response;
  }

  async schedulePlatformCleanup() {
    if (!this.ctx.id.equals(this.ctx.exports.Shop.idFromName(platformCleanupId))) throw new Error("Wrong coordinator");
    await scheduleCleanup(this.ctx.storage);
  }

  async alarm() {
    if (this.ctx.id.equals(this.ctx.exports.Shop.idFromName(platformCleanupId))) {
      await cleanupSellers(this.env.PLATFORM, this.ctx.storage);
      return;
    }
    await cleanupShop(this.ctx.storage, this.env);
  }
}
