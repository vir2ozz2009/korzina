import { createMiddleware } from "hono/factory";
import type { Cart } from "../../../src/shared/contracts/cart";
import { ApiError } from "../../../src/shared/errors";
import { credential, customerCookie } from "../../auth/cookies";
import { resolveShop } from "../../platform/resolve-shop";
import { authorizeBuyerShop } from "../../platform/shop-preview";

export const guestCart = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  if (c.req.method !== "GET") return next();
  const shop = await resolveShop(c.req.raw, c.env.PLATFORM, c.env.APP_ENV);
  if (!shop) throw new ApiError("SHOP_NOT_FOUND", "Магазин не найден");
  await authorizeBuyerShop(c.req.raw, c.env.PLATFORM, shop);
  if (credential(c.req.raw, customerCookie(shop.id))) return next();
  // No session means no cart. Do not wake Shop just to discover its currency.
  const cart: Cart = { revision: 0, currency: null, lines: [], count: 0, totalMinor: 0, adjustments: [] };
  c.header("Cache-Control", "no-store");
  return c.json(cart);
});
