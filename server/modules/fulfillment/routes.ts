import { exports } from "cloudflare:workers";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { geocodeInput, receiveCommandInput, receivingInput } from "../../../src/shared/contracts/receiving";
import { ApiError } from "../../../src/shared/errors";
import { authBodyLimit, validationFailure } from "../../auth/request";
import { sessionLimiter } from "../../auth/session-limit";
import type { ShopEnv } from "../../shop/env";
import { readCustomer } from "../auth/service";
import { geocodeAddress } from "./geocoder";
import { checkFulfillment, readFulfillment, readReceiving, saveReceiving } from "./service";

const geocodeLimit = sessionLimiter(20);
export const receivingRoutes = new Hono<ShopEnv>()
  .get("/", async (c) => {
    const settings = readFulfillment(c.env.storage);
    const session = await readCustomer(c.env.db, c.req.raw, c.env.shop.id);
    const saved = session ? readReceiving(c.env.storage, session.subject) : { revision: 0, receiving: null };
    return c.json({ ...saved, delivery: !!settings.delivery, pickup: settings.pickup ?? null });
  })
  .post("/check", authBodyLimit, zValidator("json", receivingInput, validationFailure), (c) =>
    c.json(checkFulfillment(readFulfillment(c.env.storage), c.req.valid("json"))),
  )
  .post("/geocode", authBodyLimit, zValidator("json", geocodeInput, validationFailure), async (c) => {
    const session = await readCustomer(c.env.db, c.req.raw, c.env.shop.id);
    if (!session) throw new ApiError("UNAUTHORIZED", "Нужна сессия покупателя");
    geocodeLimit(c, session.sessionId);
    const coordinator = exports.Shop.get(exports.Shop.idFromName("geocoder:osm"));
    const cache = await caches.open("shop-geocoding");
    const results = await geocodeAddress(c.env.shop.id, c.req.valid("json"), cache, (provider) =>
      coordinator.allowGeocoder(provider),
    );
    if (!results.length) throw new ApiError("ADDRESS_NOT_FOUND", "Не нашли такой адрес");
    return c.json({ results });
  })
  .post("/", authBodyLimit, zValidator("json", receiveCommandInput, validationFailure), async (c) => {
    const session = await readCustomer(c.env.db, c.req.raw, c.env.shop.id);
    if (!session) throw new ApiError("UNAUTHORIZED", "Нужна сессия покупателя");
    return c.json(saveReceiving(c.env.storage, session.subject, c.req.valid("json")));
  });
