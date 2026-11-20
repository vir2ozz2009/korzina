import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import {
  sellerBulkInput,
  sellerCatalogId,
  sellerCopyInput,
  sellerProductInput,
  sellerProductQuery,
  sellerStockInput,
} from "../../../src/shared/contracts/seller-catalog";
import { ApiError } from "../../../src/shared/errors";
import { authCommand, validationFailure } from "../../auth/request";
import { readSeller, type Seller } from "../../auth/roles";
import { executeCommand } from "../../shop/commands";
import type { ShopEnv } from "../../shop/env";
import { confirmCatalogStock, runCatalogBulk } from "./bulk";
import { catalogVersion, sellerProduct, sellerProducts } from "./products-read";
import { copySellerProduct, saveSellerProduct } from "./products-write";

type CatalogEnv = ShopEnv & { Variables: ShopEnv["Variables"] & { seller: Seller; canWrite: boolean } };
const idParam = zValidator("param", sellerCatalogId, validationFailure);
const canManage = (seller: Seller) => seller.role === "owner" || seller.permissions.includes("products");
function command<T>(c: Context<CatalogEnv>, execute: () => T) {
  const { storage, db } = c.env;
  const { body } = executeCommand(storage, db, `seller:catalog:${c.get("seller").accountId}`, c.get("command"), () => ({
    status: 200,
    body: execute(),
  }));
  return c.json(body);
}

export const sellerCatalogRoutes = new Hono<CatalogEnv>()
  .use("*", async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    const seller = await readSeller(c.req.raw, c.env.platform, c.env.shop.id);
    const canWrite = canManage(seller);
    if (c.req.method !== "GET" && !canWrite) throw new ApiError("FORBIDDEN", "Нет права изменять товары");
    c.set("seller", seller);
    c.set("canWrite", canWrite);
    await next();
  })
  .get("/access", (c) => {
    const { currency } = c.env.storage.sql
      .exec<{ currency: string }>("SELECT currency FROM catalog_state WHERE id=1")
      .one();
    return c.json({ shop: c.env.shop, canRead: true as const, canWrite: c.get("canWrite"), currency });
  })
  .get("/products", zValidator("query", sellerProductQuery, validationFailure), (c) => {
    const revision = catalogVersion(c.env.storage);
    if (c.req.query("rev") === String(revision) && !c.req.valid("query").cursor)
      return c.json({ revision, unchanged: true as const });
    return c.json({ revision, ...sellerProducts(c.env.storage, c.env.shop.id, c.req.valid("query"), revision) });
  })
  .get("/products/:id", idParam, (c) => c.json(sellerProduct(c.env.storage, c.env.shop.id, c.req.valid("param").id)))
  .use(
    "*",
    bodyLimit({
      maxSize: 65_536,
      onError: () => {
        throw new ApiError("PAYLOAD_TOO_LARGE", "Слишком большой запрос");
      },
    }),
    authCommand,
  )
  .post("/products", zValidator("json", sellerProductInput, validationFailure), (c) =>
    command(c, () => saveSellerProduct(c.env, c.get("seller").accountId, c.req.valid("json"))),
  )
  .post("/bulk", zValidator("json", sellerBulkInput, validationFailure), (c) =>
    command(c, () => runCatalogBulk(c.env, c.req.valid("json"))),
  )
  .post("/products/:id", idParam, zValidator("json", sellerProductInput, validationFailure), (c) =>
    command(c, () => saveSellerProduct(c.env, c.get("seller").accountId, c.req.valid("json"), c.req.valid("param").id)),
  )
  .post("/products/:id/copy", idParam, zValidator("json", sellerCopyInput, validationFailure), (c) =>
    command(c, () => copySellerProduct(c.env, c.req.valid("param").id, c.req.valid("json").revision)),
  )
  .post("/products/:id/stock", idParam, zValidator("json", sellerStockInput, validationFailure), (c) =>
    command(c, () => confirmCatalogStock(c.env, c.req.valid("param").id, c.req.valid("json"))),
  );
