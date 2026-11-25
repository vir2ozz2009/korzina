import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { catalogLiveInput, catalogPageInput } from "../../../src/shared/contracts/catalog";
import { catalogListInput, catalogSearchInput } from "../../../src/shared/contracts/catalog-list";
import { ApiError } from "../../../src/shared/errors";
import { readShoppingSearch } from "../../../src/shared/shopping-search";
import type { ShopEnv } from "../../shop/env";
import { readPage } from "./page";
import { readSearch } from "./search";
import { readSelection } from "./selection";
import { readDocument, readLive, readProduct } from "./service";
import { readShoppingMatches } from "./shopping-search";

export const catalogRoutes = new Hono<ShopEnv>()
  .use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
  })
  .get(
    "/page",
    zValidator("query", catalogListInput, (result) => {
      if (!result.success) throw new ApiError("VALIDATION", "Некорректные параметры каталога");
    }),
    async (c) =>
      c.json(
        await readPage(
          c.req.valid("query"),
          async (input) => readDocument(c.env.storage, input, c.env.shop.id),
          async (ids) => readLive(c.env.storage, ids, false, c.env.features.promotions),
          async (input) => readSelection(c.env.storage, input),
        ),
      ),
  )
  .get(
    "/search",
    zValidator("query", catalogSearchInput, (result) => {
      if (!result.success) throw new ApiError("VALIDATION", "Некорректный запрос поиска");
    }),
    (c) => c.json(readSearch(c.env.storage, c.req.valid("query"), c.env.shop.id, c.env.features.promotions)),
  )
  .post(
    "/shopping-search",
    bodyLimit({
      maxSize: 48_100,
      onError: () => {
        throw new ApiError("VALIDATION", "Сократите запрос до 4000 символов");
      },
    }),
    zValidator("json", z.object({ q: z.string() }), (result) => {
      if (!result.success) throw new ApiError("VALIDATION", "Некорректный список покупок");
    }),
    (c) => {
      const parsed = readShoppingSearch(c.req.valid("json").q);
      if (parsed.kind === "error") throw new ApiError("VALIDATION", parsed.message);
      return c.json(readShoppingMatches(c.env.storage, parsed, c.env.shop.id, c.env.features.promotions));
    },
  )
  .get("/selection", zValidator("query", catalogListInput), (c) =>
    c.json(readSelection(c.env.storage, c.req.valid("query"))),
  )
  .get(
    "/page-offers",
    zValidator(
      "query",
      z.object({
        ids: z
          .string()
          .transform((value) => [...new Set(value.split(",").filter(Boolean))])
          .pipe(z.array(z.string().min(1).max(120)).max(800)),
      }),
    ),
    (c) => c.json(readLive(c.env.storage, c.req.valid("query").ids, false, c.env.features.promotions)),
  )
  .get(
    "/document",
    zValidator("query", catalogPageInput, (result) => {
      if (!result.success) throw new ApiError("VALIDATION", "Некорректные параметры каталога");
    }),
    (c) => {
      const data = readDocument(c.env.storage, c.req.valid("query"), c.env.shop.id);
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
    (c) => c.json(readLive(c.env.storage, c.req.valid("query").ids, false, c.env.features.promotions)),
  )
  .get("/products/:id", (c) =>
    c.json(
      readProduct(
        c.env.storage,
        c.req.param("id"),
        c.env.shop.id,
        c.env.media.MEDIA_PUBLIC_URL,
        c.env.features.promotions,
      ),
    ),
  );
