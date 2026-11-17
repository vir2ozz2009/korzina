import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { catalogLiveInput, catalogPageInput } from "../../../src/shared/contracts/catalog";
import { ApiError } from "../../../src/shared/errors";
import type { ShopEnv } from "../../shop/env";
import { readDocument, readLive, readProduct } from "./service";

export const catalogRoutes = new Hono<ShopEnv>()
  .use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
  })
  .get(
    "/document",
    zValidator("query", catalogPageInput, (result) => {
      if (!result.success) throw new ApiError("VALIDATION", "Некорректные параметры каталога");
    }),
    (c) => {
      const data = readDocument(c.env.storage, c.req.valid("query"), c.env.shop.id, c.env.media.MEDIA_PUBLIC_URL);
      c.header("ETag", `"catalog-${data.catalogVersion}"`);
      c.header("X-Catalog-Version", String(data.catalogVersion));
      return c.json(data);
    },
  )
  .get(
    "/live",
    zValidator("query", catalogLiveInput, (result) => {
      if (!result.success) throw new ApiError("VALIDATION", "Некорректные SKU каталога");
    }),
    (c) => c.json(readLive(c.env.storage, c.req.valid("query").ids)),
  )
  .get("/products/:id", (c) =>
    c.json(readProduct(c.env.storage, c.req.param("id"), c.env.shop.id, c.env.media.MEDIA_PUBLIC_URL)),
  );
