import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { promoCommand, promoExampleInput, promoListInput } from "../../../src/shared/contracts/promo";
import { ApiError } from "../../../src/shared/errors";
import { authCommand, validationFailure } from "../../auth/request";
import { readSeller } from "../../auth/roles";
import { requireFeature } from "../../middleware/feature";
import { executeCommand } from "../../shop/commands";
import type { ShopEnv } from "../../shop/env";
import { catalogImage } from "../catalog/images";
import { exampleCart } from "./example-cart";
import { listOffers, readOffer, writeOffer } from "./offers";
import { listPromoPrices } from "./prices";
import { reportInput, reportOffer } from "./report";

type PromoEnv = ShopEnv & { Variables: ShopEnv["Variables"] & { actor: string } };
const id = zValidator("param", z.object({ id: z.string().min(1).max(120) }), validationFailure);

export const sellerPromoRoutes = new Hono<PromoEnv>()
  .use("*", requireFeature("promotions"), async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    const seller = await readSeller(c.req.raw, c.env.platform, c.env.shop.id);
    if (seller.role !== "owner" && seller.teamRole !== "manager")
      throw new ApiError("FORBIDDEN", "Недостаточно прав для акций");
    c.set("actor", seller.accountId);
    await next();
  })
  .get("/", zValidator("query", promoListInput, validationFailure), (c) => {
    const input = c.req.valid("query");
    const offers = listOffers(c.env.storage, input);
    const prices = listPromoPrices(c.env.storage, input, c.env.timeZone);
    return c.json({
      ...offers,
      prices: prices.slice(0, 30).map(({ photoId, ...price }) => ({
        ...price,
        image: catalogImage(photoId ?? null, c.env.shop.id, c.env.media.MEDIA_PUBLIC_URL),
      })),
      nextOffset: prices.length > 30 ? input.offset + 30 : offers.nextOffset,
      timeZone: c.env.timeZone,
    });
  })
  .get("/catalog", (c) => {
    const sql = c.env.storage.sql;
    return c.json({
      variants: sql
        .exec<{ id: string; name: string; productId: string; productName: string; priceMinor: number }>(
          `SELECT v.id,v.name,v.product_id AS productId,p.name AS productName,v.price_minor AS priceMinor FROM variants v JOIN products p ON p.id=v.product_id
        WHERE v.visible AND v.product_available ORDER BY p.name,v.position,v.id LIMIT 250`,
        )
        .toArray(),
      categories: sql
        .exec<{ id: string; name: string }>("SELECT id,name FROM categories WHERE visible ORDER BY name,id LIMIT 250")
        .toArray(),
    });
  })
  .get("/:id", id, (c) => {
    const { storage } = c.env;
    const offer = readOffer(storage, c.req.valid("param").id);
    const { currency } = storage.sql.exec<{ currency: string }>("SELECT currency FROM catalog_state WHERE id=1").one();
    return c.json({ ...offer, currency, timeZone: c.env.timeZone });
  })
  .get("/:id/report", id, zValidator("query", reportInput, validationFailure), (c) => {
    const offer = readOffer(c.env.storage, c.req.valid("param").id);
    return c.json(reportOffer(c.env.storage, offer, c.req.valid("query"), c.env.timeZone));
  })
  .post("/example", zValidator("json", promoExampleInput, validationFailure), (c) => {
    return c.json(exampleCart(c.env, c.req.valid("json")));
  })
  .post("/", authCommand, zValidator("json", promoCommand, validationFailure), (c) => {
    const { storage, db, timeZone } = c.env;
    const actor = c.get("actor");
    const result = executeCommand(storage, db, `promo:${actor}`, c.get("command"), () => ({
      status: 200,
      body: writeOffer(storage, undefined, c.req.valid("json"), actor, timeZone),
    }));
    return c.json(result.body);
  })
  .post("/:id", id, authCommand, zValidator("json", promoCommand, validationFailure), (c) => {
    const { storage, db, timeZone } = c.env;
    const actor = c.get("actor");
    const result = executeCommand(storage, db, `promo:${actor}`, c.get("command"), () => ({
      status: 200,
      body: writeOffer(storage, c.req.valid("param").id, c.req.valid("json"), actor, timeZone),
    }));
    return c.json(result.body);
  });
