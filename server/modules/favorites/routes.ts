import { zValidator } from "@hono/zod-validator";
import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { favoriteIdsInput, favoriteInput } from "../../../src/shared/contracts/favorites";
import { ApiError } from "../../../src/shared/errors";
import { authBodyLimit, authCommand, validationFailure } from "../../auth/request";
import { executeCommand } from "../../shop/commands";
import type { ShopEnv } from "../../shop/env";
import { carts, favorites, sessions } from "../../shop/schema";
import { readContact } from "../auth/contact";
import { readCustomer, readCustomerWith } from "../auth/service";
import { readFavoriteTiles } from "../catalog/service";
import { favoriteIds, mergeFavoriteIds } from "./service";

type Shop = ShopEnv["Bindings"];

async function readTileFavorites({ db, shop }: Shop, request: Request) {
  const session = await readCustomerWith(request, shop.id, (sessionId) => {
    const products = db
      .select({ productId: favorites.productId })
      .from(favorites)
      .where(eq(favorites.customer, sessions.subject))
      .orderBy(sql`${favorites.addedAt} DESC`, favorites.productId)
      .as("favorite_products");
    return db
      .select({
        subject: sessions.subject,
        kind: sessions.kind,
        expiresAt: sessions.expiresAt,
        phone: carts.phone,
        ids: sql<string>`(SELECT json_group_array(${products.productId}) FROM ${products})`,
      })
      .from(sessions)
      .leftJoin(carts, eq(carts.customer, sessions.subject))
      .where(eq(sessions.tokenHash, sessionId))
      .get();
  });
  if (!session || (session.kind === "guest" && !session.phone)) throw new ApiError("UNAUTHORIZED", "Войдите в магазин");
  return { ids: JSON.parse(session.ids) as string[] };
}

async function buyer(env: Shop, request: Request) {
  const session = await readCustomer(env.db, request, env.shop.id);
  if (!session || (session.kind === "guest" && !readContact(env.storage, session.subject, session.kind).phone))
    throw new ApiError("UNAUTHORIZED", "Войдите в магазин");
  return session.subject;
}

export const favoritesRoutes = new Hono<ShopEnv>()
  .use("*", async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    await next();
  })
  .get("/", async (c) => c.json(await readTileFavorites(c.env, c.req.raw)))
  .post("/tiles", authBodyLimit, zValidator("json", favoriteIdsInput, validationFailure), (c) =>
    c.json(readFavoriteTiles(c.env.storage, c.env.shop.id, c.req.valid("json").ids, c.env.features.promotions)),
  )
  .post("/", authBodyLimit, authCommand, zValidator("json", favoriteInput, validationFailure), async (c) => {
    const subject = await buyer(c.env, c.req.raw);
    const { productId, selected } = c.req.valid("json");
    const { db, storage } = c.env;
    const { body } = executeCommand(storage, db, `favorite:${subject}`, c.get("command"), () => {
      if (selected) mergeFavoriteIds(storage, subject, [productId]);
      else storage.sql.exec("DELETE FROM buyer_favorites WHERE customer=? AND product_id=?", subject, productId);
      return { status: 200, body: { ids: favoriteIds(storage, subject) } };
    });
    return c.json(body);
  })
  .post("/merge", authBodyLimit, authCommand, zValidator("json", favoriteIdsInput, validationFailure), async (c) => {
    const subject = await buyer(c.env, c.req.raw);
    const { db, storage } = c.env;
    const { body } = executeCommand(storage, db, `favorite-merge:${subject}`, c.get("command"), () => {
      mergeFavoriteIds(storage, subject, c.req.valid("json").ids);
      return { status: 200, body: { ids: favoriteIds(storage, subject) } };
    });
    return c.json(body);
  });
