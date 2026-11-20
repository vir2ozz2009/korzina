import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { orderNumberInput } from "../../../src/shared/contracts/buyer-order";
import { sellerTransitionInput } from "../../../src/shared/contracts/seller-order";
import { ApiError } from "../../../src/shared/errors";
import { authBodyLimit, authCommand, validationFailure } from "../../auth/request";
import { readSeller, type Seller } from "../../auth/roles";
import type { ShopEnv } from "../../shop/env";
import { sellerOrder } from "./order";
import { transitionOrder } from "./transition";

type SellerOrderEnv = ShopEnv & { Variables: ShopEnv["Variables"] & { seller: Seller } };
const params = zValidator("param", z.object({ number: orderNumberInput }), validationFailure);

export const sellerOrderRoutes = new Hono<SellerOrderEnv>()
  .use("*", async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    const seller = await readSeller(c.req.raw, c.env.platform, c.env.shop.id);
    if (seller.role !== "owner" && !seller.permissions.includes("orders"))
      throw new ApiError("FORBIDDEN", "Нет доступа к заказам");
    c.set("seller", seller);
    await next();
  })
  .get("/:number", params, (c) => c.json(sellerOrder(c.env.storage, c.req.valid("param").number, c.get("seller"))))
  .post(
    "/:number/transition",
    authBodyLimit,
    authCommand,
    params,
    zValidator("json", sellerTransitionInput, validationFailure),
    (c) =>
      c.json(
        transitionOrder(c.env, c.get("seller"), c.req.valid("param").number, c.req.valid("json"), c.get("command")),
      ),
  );
