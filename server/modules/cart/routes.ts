import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { cartCommandInput } from "../../../src/shared/contracts/cart";
import { ApiError } from "../../../src/shared/errors";
import { authBodyLimit, validationFailure } from "../../auth/request";
import { idempotency } from "../../middleware/idempotency";
import { acceptsCheckout, type ShopEnv } from "../../shop/env";
import { readCustomer } from "../auth/service";
import { listPublicCartPromos } from "../promo/public-cart";
import { readCartState } from "./cart-state";
import { changeCart, readCart } from "./service";

export const cartRoutes = new Hono<ShopEnv>()
  .get("/", async (c) => {
    const session = await readCustomer(c.env.db, c.req.raw, c.env.shop.id);
    return c.json(
      readCart(c.env.storage, session?.subject ?? "", {
        id: c.env.shop.id,
        mediaOrigin: c.env.media.MEDIA_PUBLIC_URL,
        promotions: c.env.features.promotions,
        maps: c.env.features.maps,
        timeZone: c.env.timeZone,
      }),
    );
  })
  .get("/promotions", async (c) => {
    c.header("Cache-Control", "private, no-store");
    if (!c.env.features.promotions) throw new ApiError("FORBIDDEN", "Акции недоступны");
    const session = await readCustomer(c.env.db, c.req.raw, c.env.shop.id);
    const customer = session?.subject ?? "";
    const now = Date.now();
    const { cart } = readCartState(c.env.storage, customer, {
      id: c.env.shop.id,
      mediaOrigin: c.env.media.MEDIA_PUBLIC_URL,
      promotions: true,
      now,
    });
    return c.json(listPublicCartPromos(c.env.storage, customer, cart, now));
  })
  .post("/", authBodyLimit, idempotency, zValidator("json", cartCommandInput, validationFailure), async (c) => {
    const session = await readCustomer(c.env.db, c.req.raw, c.env.shop.id);
    if (!session) throw new ApiError("UNAUTHORIZED", "Нужна сессия покупателя");
    if (!acceptsCheckout(c.env)) throw new ApiError("FORBIDDEN", "Магазин временно закрыт");
    const result = changeCart(
      c.env.storage,
      session.subject,
      {
        id: c.env.shop.id,
        mediaOrigin: c.env.media.MEDIA_PUBLIC_URL,
        promotions: c.env.features.promotions,
        maps: c.env.features.maps,
        timeZone: c.env.timeZone,
      },
      c.req.valid("json"),
      c.get("command"),
    );
    return c.json(result);
  });
