import { exports } from "cloudflare:workers";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { geocodeInput, receiveCommandInput, receivingInput } from "../../../src/shared/contracts/receiving";
import { methodInput, timeCommandInput } from "../../../src/shared/contracts/receiving-time";
import { defaultShopTimeZone } from "../../../src/shared/datetime";
import { ApiError } from "../../../src/shared/errors";
import { authBodyLimit, validationFailure } from "../../auth/request";
import { sessionLimiter } from "../../auth/session-limit";
import type { ShopEnv } from "../../shop/env";
import { readCustomer } from "../auth/service";
import { readAvailability, saveTime } from "./availability";
import { geocodeAddress } from "./geocoder";
import {
  checkFulfillment,
  emptySelection,
  publicFulfillment,
  readFulfillment,
  readReceiving,
  saveReceiving,
} from "./service";

const geocodeLimit = sessionLimiter(20);
export const receivingRoutes = new Hono<ShopEnv>()
  .get("/availability", zValidator("query", z.object({ method: methodInput }), validationFailure), (c) => {
    const { method } = c.req.valid("query");
    const settings = readFulfillment(c.env.storage, c.env.features.maps);
    if (!settings[method]) throw new ApiError("NOT_FOUND", "Способ получения недоступен");
    return c.json(readAvailability(c.env.storage, method));
  })
  .post("/time", authBodyLimit, zValidator("json", timeCommandInput, validationFailure), async (c) => {
    const session = await readCustomer(c.env.db, c.req.raw, c.env.shop.id);
    if (!session) throw new ApiError("UNAUTHORIZED", "Нужна сессия покупателя");
    if (c.env.shop.status !== "active") throw new ApiError("FORBIDDEN", "Магазин временно закрыт");
    return c.json(saveTime(c.env.storage, session.subject, c.req.valid("json"), c.env.features.maps));
  })
  .get("/", async (c) => {
    const settings = readFulfillment(c.env.storage, c.env.features.maps);
    const session = await readCustomer(c.env.db, c.req.raw, c.env.shop.id);
    const saved = session ? readReceiving(c.env.storage, session.subject) : { revision: 0, ...emptySelection() };
    const availability = saved.receiving ? checkFulfillment(settings, saved.receiving) : null;
    return c.json({ ...saved, availability, ...publicFulfillment(settings, c.env.timeZone ?? defaultShopTimeZone) });
  })
  .post("/check", authBodyLimit, zValidator("json", receivingInput, validationFailure), (c) =>
    c.json(checkFulfillment(readFulfillment(c.env.storage, c.env.features.maps), c.req.valid("json"))),
  )
  .post("/geocode", authBodyLimit, zValidator("json", geocodeInput, validationFailure), async (c) => {
    const session = await readCustomer(c.env.db, c.req.raw, c.env.shop.id);
    if (!session) throw new ApiError("UNAUTHORIZED", "Нужна сессия покупателя");
    if (readFulfillment(c.env.storage, c.env.features.maps).delivery?.mode !== "map")
      throw new ApiError("FEATURE_DISABLED", "Поиск по карте недоступен");
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
    if (c.env.shop.status !== "active") throw new ApiError("FORBIDDEN", "Магазин временно закрыт");
    return c.json(saveReceiving(c.env.storage, session.subject, c.req.valid("json"), c.env.features.maps));
  });
