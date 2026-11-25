import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { z } from "zod";
import {
  moneyOperationsQuery,
  moneyPeriod,
  moneyTasksQuery,
  type SellerMoneyOverview,
} from "../../../src/shared/contracts/seller-money";
import { defaultShopTimeZone, shopDateTime } from "../../../src/shared/datetime";
import { ApiError } from "../../../src/shared/errors";
import { validationFailure } from "../../auth/request";
import { readSeller } from "../../auth/roles";
import type { ShopEnv } from "../../shop/env";
import { shopTimeZoneSql } from "../../shop/time-zone";
import { moneyOperations, moneyTotals } from "./operations";
import { moneyTaskCounts, moneyTasks } from "./tasks";

type Context = Pick<SellerMoneyOverview, "currency" | "revision" | "timeZone">;
type MoneyEnv = ShopEnv & { Variables: ShopEnv["Variables"] & { money: Context } };

function selection(context: Context, query: z.infer<typeof moneyPeriod>) {
  const today = shopDateTime(Date.now(), context.timeZone).date;
  const period = query.from && query.to ? { from: query.from, to: query.to } : { from: today, to: today };
  if (period.to > today || period.from < "1900-01-01") throw new ApiError("VALIDATION", "Проверьте даты периода");
  return { ...context, period };
}

export const sellerMoneyRoutes = new Hono<MoneyEnv>()
  .use("*", async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    const seller = await readSeller(c.req.raw, c.env.platform, c.env.shop.id);
    if (seller.role !== "owner" && !seller.permissions.includes("payments"))
      throw new ApiError("FORBIDDEN", "Доступ ограничен");
    const row = c.env.storage.sql
      .exec<Context>(
        `SELECT currency,${shopTimeZoneSql} AS timeZone,
        (SELECT CAST(value AS INTEGER) FROM settings WHERE key='seller_orders_revision') AS revision
      FROM catalog_state WHERE id=1`,
      )
      .one();
    c.set("money", { ...row, timeZone: row.timeZone || c.env.timeZone || defaultShopTimeZone });
    await next();
  })
  .get("/", zValidator("query", moneyPeriod, validationFailure), (c) => {
    const query = c.req.valid("query");
    const data = selection(c.get("money"), query);
    if (data.revision === query.rev && (query.from || query.cachedDay === data.period.from))
      return c.json({ ...data, unchanged: true as const });
    return c.json({
      ...data,
      ...moneyTotals(c.env.storage, data),
      counts: moneyTaskCounts(c.env.storage, data.currency),
    } satisfies SellerMoneyOverview);
  })
  .get("/tasks", zValidator("query", moneyTasksQuery, validationFailure), (c) =>
    c.json(moneyTasks(c.env.storage, c.get("money"), c.req.valid("query"))),
  )
  .get("/operations", zValidator("query", moneyOperationsQuery, validationFailure), (c) => {
    const query = c.req.valid("query");
    return c.json(moneyOperations(c.env.storage, selection(c.get("money"), query), query));
  });
