import { Hono } from "hono";
import { ApiError } from "../../../src/shared/errors";
import { storefrontUrl } from "./registry";

export const publicShop = new Hono<{ Bindings: Env }>().get("/:id", async (c) => {
  const row = await c.env.PLATFORM.withSession("first-primary")
    .prepare("SELECT slug FROM shops WHERE id=? AND status IN ('draft','active','paused')")
    .bind(c.req.param("id"))
    .first<{ slug: string }>();
  if (!row) throw new ApiError("SHOP_NOT_FOUND", "Магазин не найден");
  c.header("Cache-Control", "no-store");
  const url = new URL(storefrontUrl(c.req.raw, c.env.APP_ENV, row.slug));
  if (c.req.query("destination") === "seller") {
    url.pathname = "/seller";
    url.searchParams.set("store", row.slug);
  }
  return c.redirect(url.href, 302);
});
