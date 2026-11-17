import { Hono } from "hono";
import { resolveShop } from "./platform/resolve-shop";

export { Shop } from "./shop/Shop";

export const app = new Hono<{ Bindings: Env }>()
  .get("/api/health", (c) => c.json({ ok: true }))
  .get("/api/shop", async (c) => {
    const shop = await resolveShop(c.req.raw, c.env.PLATFORM);
    if (!shop) return c.json({ error: { code: "SHOP_NOT_FOUND", message: "Магазин не найден" } }, 404);
    const headers = new Headers(c.req.raw.headers);
    headers.set("x-korzina-shop", encodeURIComponent(JSON.stringify(shop)));
    const stub = c.env.SHOP.get(c.env.SHOP.idFromName(shop.id));
    const upstream = await stub.fetch(new Request(c.req.raw, { headers }));
    const response = new Response(upstream.body, upstream);
    response.headers.set("Cache-Control", "no-store");
    return response;
  })
  .notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "Не найдено" } }, 404));

export type AppType = typeof app;

export default app;
