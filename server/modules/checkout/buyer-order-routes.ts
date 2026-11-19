import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import {
  historyInput,
  orderChangeInput,
  orderNumberInput,
  repeatOrderInput,
  replaceProofInput,
} from "../../../src/shared/contracts/buyer-order";
import { ApiError } from "../../../src/shared/errors";
import { authBodyLimit, authCommand, validationFailure } from "../../auth/request";
import type { ShopEnv } from "../../shop/env";
import { readCustomer } from "../auth/service";
import { cancelBuyerOrder, replaceBuyerProof } from "./buyer-order-commands";
import { activeBuyerOrders, buyerOrder, buyerOrderRow, buyerOrdersPage } from "./buyer-orders";
import { previewRepeatOrder, repeatBuyerOrder } from "./repeat-order";

const params = zValidator("param", z.object({ number: orderNumberInput }), validationFailure);
async function subject(env: ShopEnv["Bindings"], request: Request) {
  const actor = await readCustomer(env.db, request, env.shop.id);
  if (!actor) throw new ApiError("UNAUTHORIZED", "Войдите в магазин");
  return actor.subject;
}

export const buyerOrderRoutes = new Hono<ShopEnv>()
  .use("*", async (c, next) => {
    await next();
    if (!c.res.headers.has("Cache-Control")) c.header("Cache-Control", "private, no-store");
  })
  .get("/active", async (c) => activeBuyerOrders(c.env.storage, await subject(c.env, c.req.raw), c.req.raw))
  .get("/", zValidator("query", historyInput, validationFailure), async (c) => {
    const { tab, cursor } = c.req.valid("query");
    return c.json(buyerOrdersPage(c.env.storage, await subject(c.env, c.req.raw), tab, cursor));
  })
  .get("/:number", params, async (c) => {
    const row = buyerOrderRow(c.env.storage, await subject(c.env, c.req.raw), c.req.valid("param").number);
    return c.json(buyerOrder(row));
  })
  .get("/:number/repeat", params, async (c) =>
    c.json(previewRepeatOrder(c.env, await subject(c.env, c.req.raw), c.req.valid("param").number)),
  )
  .post(
    "/:number/cancel",
    authBodyLimit,
    authCommand,
    params,
    zValidator("json", orderChangeInput, validationFailure),
    async (c) =>
      c.json(
        cancelBuyerOrder(
          c.env,
          await subject(c.env, c.req.raw),
          c.req.valid("param").number,
          c.req.valid("json").expectedVersion,
          c.get("command"),
        ),
      ),
  )
  .post(
    "/:number/proof",
    authBodyLimit,
    authCommand,
    params,
    zValidator("json", replaceProofInput, validationFailure),
    async (c) => {
      const { expectedVersion, proofMediaId } = c.req.valid("json");
      return c.json(
        replaceBuyerProof(
          c.env,
          await subject(c.env, c.req.raw),
          c.req.valid("param").number,
          expectedVersion,
          proofMediaId,
          c.get("command"),
        ),
      );
    },
  )
  .post(
    "/:number/repeat",
    authBodyLimit,
    authCommand,
    params,
    zValidator("json", repeatOrderInput, validationFailure),
    async (c) =>
      c.json(
        repeatBuyerOrder(
          c.env,
          await subject(c.env, c.req.raw),
          c.req.valid("param").number,
          c.req.valid("json"),
          c.get("command"),
        ),
      ),
  );
