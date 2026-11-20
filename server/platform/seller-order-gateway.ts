import { createMiddleware } from "hono/factory";
import { ApiError } from "../../src/shared/errors";
import { forwardToShop } from "../shop/forward";
import { shopContexts } from "./shop-context";

export const sellerOrderGateway = createMiddleware<{ Bindings: Env }>(async (c) => {
  const store = c.req.query("store");
  if (!store || !/^[a-z0-9-]{1,63}$/u.test(store)) throw new ApiError("VALIDATION", "Выберите магазин");
  const origin = new URL("http://localhost/");
  origin.searchParams.set("shop", store);
  const shop = await shopContexts.read(new Request(origin), c.env);
  return forwardToShop(c, shop);
});
