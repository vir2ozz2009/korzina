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
import { cleanupMedia } from "../modules/media/cleanup";
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
      const parsed = shopContract.safeParse(JSON.parse(decodeURIComponent(metadata)));
      if (!parsed.success) throw new ApiError("FORBIDDEN", "Нет магазина");
      const shop = parsed.data;
      const context = shopContextContract.safeParse(JSON.parse(decodeURIComponent(metadata)));
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
        features: context.success ? context.data.features : resolveFeatures([]),
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
    // Only the public Worker can see these; it strips them before returning to the client.
    response.headers.set("x-korzina-sql", JSON.stringify(metric));
    return response;
  }

  async alarm() {
    await cleanupMedia(this.ctx.storage, this.env);
  }
}
