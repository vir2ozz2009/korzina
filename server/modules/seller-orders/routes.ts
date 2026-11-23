import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { orderNumberInput } from "../../../src/shared/contracts/buyer-order";
import { compositionEdits, compositionProposal, timeChangeInput } from "../../../src/shared/contracts/order-changes";
import { sellerOrderCommand, sellerOrdersQuery } from "../../../src/shared/contracts/seller-order";
import { workdayDay, workdayMonth } from "../../../src/shared/contracts/workday";
import { defaultShopTimeZone } from "../../../src/shared/datetime";
import { ApiError } from "../../../src/shared/errors";
import { authBodyLimit, authCommand, validationFailure } from "../../auth/request";
import { readSeller, type Seller } from "../../auth/roles";
import type { ShopEnv } from "../../shop/env";
import { proposeChanges, quoteChanges } from "../order-changes/composition";
import { changeTime, timeAvailability } from "../order-changes/time";
import { changeSellerOrder, permitted } from "./command";
import { orderListRevision, sellerOrders } from "./list";
import { sellerLiveTicket, upgradeSellerOrders } from "./live";
import { sellerOrder } from "./order";
import { sellerReceipt } from "./receipt";
import { sellerOrderCalendar, sellerWorkday } from "./workday";
import { sellerPacking } from "./workday-packing";

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
  .get("/", zValidator("query", sellerOrdersQuery, validationFailure), (c) => {
    const query = c.req.valid("query");
    const seller = c.get("seller");
    if (query.focus === "receipt" || query.focus === "payment" || query.focus === "debt" || query.debt)
      permitted(seller, "payments");
    const money = seller.role === "owner" || seller.permissions.includes("payments");
    return c.json(sellerOrders(c.env.storage, query, c.env.timeZone ?? defaultShopTimeZone, money));
  })
  .get("/workday", zValidator("query", workdayDay, validationFailure), (c) => {
    const seller = c.get("seller");
    const timeZone = c.env.timeZone ?? defaultShopTimeZone;
    return c.json(
      sellerWorkday(
        { storage: c.env.storage, timeZone, now: Date.now() },
        seller.role === "owner" || seller.permissions.includes("payments"),
        c.req.valid("query").version,
      ),
    );
  })
  .get("/packing", zValidator("query", workdayDay, validationFailure), (c) => {
    permitted(c.get("seller"), "assembly");
    return c.json(
      sellerPacking(c.env.storage, c.env.timeZone ?? defaultShopTimeZone, Date.now(), c.req.valid("query").day),
    );
  })
  .get("/calendar", zValidator("query", workdayMonth, validationFailure), (c) => {
    const { month, version } = c.req.valid("query");
    return c.json(
      sellerOrderCalendar(
        { storage: c.env.storage, timeZone: c.env.timeZone ?? defaultShopTimeZone, now: Date.now() },
        month,
        version,
      ),
    );
  })
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
    "/:number/composition/quote",
    authBodyLimit,
    params,
    zValidator("json", compositionEdits, validationFailure),
    (c) => c.json(quoteChanges(c.env, c.get("seller"), c.req.valid("param").number, c.req.valid("json"))),
  )
  .post(
    "/:number/composition",
    authBodyLimit,
    authCommand,
    params,
    zValidator("json", compositionProposal, validationFailure),
    (c) =>
      c.json(
        proposeChanges(c.env, c.get("seller"), c.req.valid("param").number, c.req.valid("json"), c.get("command")),
      ),
  )
  .get("/:number/time", params, (c) =>
    c.json(timeAvailability(c.env, { side: "seller", id: c.get("seller").accountId }, c.req.valid("param").number)),
  )
  .post(
    "/:number/time",
    authBodyLimit,
    authCommand,
    params,
    zValidator("json", timeChangeInput, validationFailure),
    (c) =>
      c.json(
        changeTime(
          c.env,
          { side: "seller", id: c.get("seller").accountId },
          c.req.valid("param").number,
          c.req.valid("json"),
          c.get("command"),
        ),
      ),
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
