import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { emptyInput } from "../../../src/shared/contracts/auth";
import { checkoutInput, receiptQuoteInput, shopContactsInput } from "../../../src/shared/contracts/checkout";
import { ApiError } from "../../../src/shared/errors";
import { authBodyLimit, authCommand, validationFailure } from "../../auth/request";
import type { ShopEnv } from "../../shop/env";
import { schedulePlatformOrders } from "../../shop/order-projection";
import { readCustomer } from "../auth/service";
import { bindReceipt, placeOrder, readOrder } from "./order";
import { createQuote, purchaseSummary } from "./quote";

async function authenticated(env: ShopEnv["Bindings"], request: Request) {
  const actor = await readCustomer(env.db, request, env.shop.id);
  if (!actor) throw new ApiError("UNAUTHORIZED", "Сначала войдите в магазин");
  return actor;
}

export const purchaseRoutes = new Hono<ShopEnv>()
  .get("/checkout/summary", async (c) => {
    const actor = await readCustomer(c.env.db, c.req.raw, c.env.shop.id);
    return c.json(purchaseSummary(c.env, actor?.subject ?? ""));
  })
  .get("/checkout/support", (c) => {
    const row = c.env.storage.sql
      .exec<{ value: string }>("SELECT value FROM settings WHERE key='shop_contacts'")
      .toArray()[0];
    return c.json(row ? shopContactsInput.parse(JSON.parse(row.value)) : []);
  })
  .post("/quote", authBodyLimit, authCommand, zValidator("json", emptyInput, validationFailure), async (c) => {
    const actor = await authenticated(c.env, c.req.raw);
    return c.json(createQuote(c.env, actor.subject, actor.kind));
  })
  .post("/checkout", authBodyLimit, authCommand, zValidator("json", checkoutInput, validationFailure), async (c) => {
    const actor = await authenticated(c.env, c.req.raw);
    const result = placeOrder(c.env, actor, c.req.valid("json"), c.get("command"));
    await schedulePlatformOrders(c.env.storage);
    return c.json(result.body, 201);
  })
  .post(
    "/checkout/receipt",
    authBodyLimit,
    authCommand,
    zValidator("json", receiptQuoteInput, validationFailure),
    async (c) => {
      const actor = await authenticated(c.env, c.req.raw);
      const { proofMediaId, quoteRevision } = c.req.valid("json");
      bindReceipt(c.env.storage, actor.subject, proofMediaId, quoteRevision);
      return c.json({ ok: true });
    },
  )
  .get("/checkout/orders/:number", async (c) => {
    const actor = await authenticated(c.env, c.req.raw);
    const number = Number(c.req.param("number"));
    if (!Number.isSafeInteger(number) || number <= 0) throw new ApiError("NOT_FOUND", "Заказ недоступен");
    return c.json(readOrder(c.env.storage, actor.subject, number));
  });
