import { DurableObject } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import { Hono } from "hono";
import type { PlatformShop } from "../platform/schema";
import { migrations } from "./migrations";
import { settings } from "./schema";

export class Shop extends DurableObject<Env> {
  private readonly db;
  private readonly router;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.db = drizzle(ctx.storage);
    ctx.blockConcurrencyWhile(() => migrate(this.db, migrations));
    this.router = new Hono<{ Bindings: { shop: PlatformShop } }>()
      .get("/api/shop", (c) => {
        const shop = c.env.shop;
        const displayName = this.db.select().from(settings).where(eq(settings.key, "display_name")).get();
        return c.json({ ...shop, name: displayName?.value ?? shop.name });
      })
      .notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "Не найдено" } }, 404));
  }

  fetch(request: Request): Promise<Response> {
    // Only the platform router supplies this metadata after resolving the host in D1.
    const metadata = request.headers.get("x-korzina-shop");
    if (!metadata)
      return Promise.resolve(Response.json({ error: { code: "FORBIDDEN", message: "Нет магазина" } }, { status: 403 }));
    const shop: PlatformShop = JSON.parse(decodeURIComponent(metadata));
    const identity = this.db.select().from(settings).where(eq(settings.key, "shop_id")).get();
    if (!this.env.SHOP.idFromName(shop.id).equals(this.ctx.id) || (identity && identity.value !== shop.id)) {
      return Promise.resolve(
        Response.json({ error: { code: "FORBIDDEN", message: "Другой магазин" } }, { status: 403 }),
      );
    }
    this.ctx.storage.transactionSync(() => {
      this.db.insert(settings).values({ key: "shop_id", value: shop.id }).onConflictDoNothing().run();
    });
    return Promise.resolve(this.router.fetch(request, { shop }));
  }
}
