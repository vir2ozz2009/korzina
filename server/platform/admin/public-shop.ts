import { Hono } from "hono";
import { ApiError } from "../../../src/shared/errors";
import { storefrontUrl } from "../storefront-url";

export const publicShop = new Hono<{ Bindings: Env }>().get("/:id", async (c) => {
  const row = await c.env.PLATFORM.withSession("first-primary")
    .prepare("SELECT slug FROM shops WHERE id=? AND status IN ('draft','active','paused')")
    .bind(c.req.param("id"))
    .first<{ slug: string }>();
  if (!row) throw new ApiError("SHOP_NOT_FOUND", "Магазин не найден");
  c.header("Cache-Control", "no-store");
  const url = new URL(storefrontUrl(c.req.url, c.env.APP_ENV, row.slug));
  if (c.req.query("destination") === "seller") {
    const order = c.req.query("order");
    url.pathname = order && /^[1-9]\d{0,14}$/u.test(order) ? `/seller/orders/${order}` : "/seller";
    url.searchParams.set("store", row.slug);
  }
  return c.redirect(url.href, 302);
});
