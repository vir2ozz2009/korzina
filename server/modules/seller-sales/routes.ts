import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { salesSearch } from "../../../src/shared/contracts/seller-sales";
import { defaultShopTimeZone } from "../../../src/shared/datetime";
import { ApiError } from "../../../src/shared/errors";
import { validationFailure } from "../../auth/request";
import { readSeller } from "../../auth/roles";
import type { ShopEnv } from "../../shop/env";
import { shopTimeZoneSql } from "../../shop/time-zone";
import { readsSellerCatalog } from "../seller-catalog/access";
import { rankProducts, readProductSales } from "./products";
import { ensureSalesProjection } from "./projection";
import { completedWeek, sellerSalesDays, sellerSalesReport, weeklyRevenue } from "./report";

type SalesEnv = ShopEnv & {
  Variables: ShopEnv["Variables"] & {
    timeZone: string;
    currency: string;
    now: number;
    canReadCatalog: boolean;
  };
};

function selection(c: { get(key: "now"): number; get(key: "timeZone"): string }, query: z.infer<typeof salesSearch>) {
  return query.from && query.to ? { from: query.from, to: query.to } : completedWeek(c.get("now"), c.get("timeZone"));
}

const extras = z.object({ cursor: z.string().max(250).optional(), variant: z.string().max(128).optional() });
const validatePeriod = zValidator("query", z.intersection(salesSearch, extras), validationFailure);

export const sellerSalesRoutes = new Hono<SalesEnv>()
  .use("*", async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    const seller = await readSeller(c.req.raw, c.env.platform, c.env.shop.id);
    if (seller.role !== "owner" && !seller.permissions.includes("payments"))
      throw new ApiError("FORBIDDEN", "Доступ ограничен");
    const { storage } = c.env;
    const { timeZone, currency } = storage.sql
      .exec<{ timeZone: string; currency: string }>(
        `SELECT ${shopTimeZoneSql} AS timeZone,(SELECT currency FROM catalog_state WHERE id=1) AS currency`,
      )
      .one();
    c.set("timeZone", timeZone || c.env.timeZone || defaultShopTimeZone);
    c.set("currency", currency);
    c.set("now", Date.now());
    c.set("canReadCatalog", readsSellerCatalog(seller));
    ensureSalesProjection(storage, c.get("timeZone"), currency);
    await next();
  })
  .get("/summary", (c) => c.json(weeklyRevenue(c.env.storage, c.get("timeZone"), c.get("currency"), c.get("now"))))
  .get("/report", validatePeriod, (c) => {
    const query = c.req.valid("query");
    return c.json(
      sellerSalesReport(
        c.env.storage,
        c.get("timeZone"),
        c.get("currency"),
        selection(c, query),
        query.compare !== "0",
      ),
    );
  })
  .get("/days", validatePeriod, (c) => {
    const currency = c.get("currency");
    return c.json({
      currency,
      rows: sellerSalesDays(c.env.storage, c.get("timeZone"), currency, selection(c, c.req.valid("query"))),
    });
  })
  .get("/products", validatePeriod, (c) => {
    const query = c.req.valid("query");
    return c.json(rankProducts(c.env.storage, c.get("timeZone"), c.get("currency"), selection(c, query), query.cursor));
  })
  .get("/products/:id", validatePeriod, (c) => {
    const query = c.req.valid("query");
    return c.json(
      readProductSales(
        c.env.storage,
        c.get("timeZone"),
        c.get("currency"),
        selection(c, query),
        c.req.param("id"),
        query.variant,
        c.get("canReadCatalog"),
      ),
    );
  });
