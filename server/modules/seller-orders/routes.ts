import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { orderNumberInput } from "../../../src/shared/contracts/buyer-order";
import { sellerOrderCommand, sellerOrdersQuery } from "../../../src/shared/contracts/seller-order";
import { ApiError } from "../../../src/shared/errors";
import { authBodyLimit, authCommand, validationFailure } from "../../auth/request";
import { readSeller, type Seller } from "../../auth/roles";
import type { ShopEnv } from "../../shop/env";
import { changeSellerOrder, permitted } from "./command";
import { orderListRevision, sellerOrders } from "./list";
import { sellerLiveTicket, upgradeSellerOrders } from "./live";
import { sellerOrder } from "./order";
import { sellerReceipt } from "./receipt";

type SellerOrderEnv = ShopEnv & { Variables: ShopEnv["Variables"] & { seller: Seller } };
const params = zValidator("param", z.object({ number: orderNumberInput }), validationFailure);

export const sellerOrderRoutes = new Hono<SellerOrderEnv>()
  .use("*", async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    if (c.req.path.endsWith("/live") && c.req.method === "GET")
      return upgradeSellerOrders(c.env.object, c.env, c.req.raw);
    const seller = await readSeller(c.req.raw, c.env.platform, c.env.shop.id);
    if (seller.role !== "owner" && !seller.permissions.includes("orders"))
      throw new ApiError("FORBIDDEN", "Нет доступа к заказам");
    c.set("seller", seller);
    await next();
  })
  .get("/", zValidator("query", sellerOrdersQuery, validationFailure), (c) =>
    c.json(sellerOrders(c.env.storage, c.req.valid("query"), c.env.timeZone ?? "Asia/Ho_Chi_Minh")),
  )
  .get(
    "/:number/receipts/:id",
    zValidator("param", z.object({ number: orderNumberInput, id: z.uuid() }), validationFailure),
    (c) => {
      permitted(c.get("seller"), "payments");
      const { number, id } = c.req.valid("param");
      return sellerReceipt(c.env, number, id);
    },
  )
  .get("/badge", (c) => {
    const { storage } = c.env;
    const rev = orderListRevision(storage);
    if (c.req.query("rev") === String(rev)) return c.json({ rev, unchanged: true as const });
    const { count } = storage.sql
      .exec<{ count: number }>("SELECT COUNT(*) AS count FROM seller_order_index WHERE stage='placed'")
      .one();
    return c.json({ rev, count });
  })
  .post("/live-ticket", (c) => sellerLiveTicket(c.env, c.req.raw).then((ticket) => c.json(ticket)))
  .get("/:number", params, (c) =>
    c.json(sellerOrder(c.env.storage, c.req.valid("param").number, c.get("seller"), c.env.timeZone)),
  )
  .post(
    "/:number/transition",
    authBodyLimit,
    authCommand,
    params,
    zValidator("json", sellerOrderCommand, validationFailure),
    (c) =>
      c.json(
        changeSellerOrder(c.env, c.get("seller"), c.req.valid("param").number, c.req.valid("json"), c.get("command")),
      ),
  );
