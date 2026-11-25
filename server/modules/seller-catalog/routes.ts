import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import {
  sellerBulkInput,
  sellerCatalogId,
  sellerCategoryOrder,
  sellerCopyInput,
  sellerGroupDelete,
  sellerGroupInput,
  sellerGroupListParams,
  sellerGroupParams,
  sellerProductInput,
  sellerProductQuery,
  sellerStockInput,
} from "../../../src/shared/contracts/seller-catalog";
import { ApiError } from "../../../src/shared/errors";
import { authCommand, validationFailure } from "../../auth/request";
import { readSeller, type Seller } from "../../auth/roles";
import { executeCommand } from "../../shop/commands";
import type { ShopEnv } from "../../shop/env";
import { readsSellerCatalog, writesSellerCatalog } from "./access";
import { confirmCatalogStock, runCatalogBulk } from "./bulk";
import { sellerGroup, sellerGroups } from "./groups-read";
import { deleteGroup, reorderCategories, saveGroup } from "./groups-write";
import { catalogVersion, sellerProduct, sellerProducts } from "./products-read";
import { copySellerProduct, saveSellerProduct } from "./products-write";

type CatalogEnv = ShopEnv & { Variables: ShopEnv["Variables"] & { seller: Seller; canWrite: boolean } };
const idParam = zValidator("param", sellerCatalogId, validationFailure);
function command<T>(c: Context<CatalogEnv>, execute: () => T) {
  const { storage, db } = c.env;
  const { body } = executeCommand(storage, db, `seller:catalog:${c.get("seller").accountId}`, c.get("command"), () => {
    const body = execute();
    c.env.changes.catalog();
    return { status: 200, body };
  });
  return c.json(body);
}

export const sellerCatalogRoutes = new Hono<CatalogEnv>()
  .use("*", async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    const seller = await readSeller(c.req.raw, c.env.platform, c.env.shop.id);
    const canWrite = writesSellerCatalog(seller);
    if (!canWrite && (!readsSellerCatalog(seller) || c.req.method !== "GET"))
      throw new ApiError("FORBIDDEN", "Недостаточно прав для каталога продавца");
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
  .get("/groups/:kind", zValidator("param", sellerGroupListParams, validationFailure), (c) =>
    c.json({
      groups: sellerGroups(c.env.storage, c.env.shop.id, c.req.valid("param").kind),
      revision: catalogVersion(c.env.storage),
    }),
  )
  .get("/groups/:kind/:id", zValidator("param", sellerGroupParams, validationFailure), (c) => {
    const { kind, id } = c.req.valid("param");
    return c.json(sellerGroup(c.env.storage, c.env.shop.id, kind, id));
  })
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
  )
  .post("/category-order", zValidator("json", sellerCategoryOrder, validationFailure), (c) =>
    command(c, () => reorderCategories(c.env, c.req.valid("json"))),
  )
  .post(
    "/groups/:kind",
    zValidator("param", sellerGroupListParams, validationFailure),
    zValidator("json", sellerGroupInput, validationFailure),
    (c) =>
      command(c, () => saveGroup(c.env, c.get("seller").accountId, c.req.valid("param").kind, c.req.valid("json"))),
  )
  .post(
    "/groups/:kind/:id",
    zValidator("param", sellerGroupParams, validationFailure),
    zValidator("json", sellerGroupInput, validationFailure),
    (c) => {
      const { kind, id } = c.req.valid("param");
      return command(c, () => saveGroup(c.env, c.get("seller").accountId, kind, c.req.valid("json"), id));
    },
  )
  .post(
    "/groups/:kind/:id/delete",
    zValidator("param", sellerGroupParams, validationFailure),
    zValidator("json", sellerGroupDelete, validationFailure),
    (c) => {
      const { kind, id } = c.req.valid("param");
      return command(c, () => deleteGroup(c.env, kind, id, c.req.valid("json")));
    },
  );
