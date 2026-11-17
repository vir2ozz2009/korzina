import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { cartChangeInput } from "../../../src/shared/contracts/cart";
import { ApiError } from "../../../src/shared/errors";
import { authBodyLimit, validationFailure } from "../../auth/request";
import { idempotency } from "../../middleware/idempotency";
import type { ShopEnv } from "../../shop/env";
import { readCustomer } from "../auth/service";
import { changeCart, readCart } from "./service";

export const cartRoutes = new Hono<ShopEnv>()
  .get("/", async (c) => {
    const session = await readCustomer(c.env.db, c.req.raw, c.env.shop.id);
    return c.json(readCart(c.env.storage, session?.subject ?? "").cart);
  })
  .post("/", authBodyLimit, idempotency, zValidator("json", cartChangeInput, validationFailure), async (c) => {
    const session = await readCustomer(c.env.db, c.req.raw, c.env.shop.id);
    if (!session) throw new ApiError("UNAUTHORIZED", "Нужна сессия покупателя");
    if (c.env.shop.status !== "active") throw new ApiError("FORBIDDEN", "Магазин временно закрыт");
    const result = changeCart(c.env.storage, session.subject, c.req.valid("json"), c.get("command"));
    return c.json(result);
  });
