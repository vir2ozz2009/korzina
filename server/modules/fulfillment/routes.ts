import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import {
  geocodeInput,
  receiveCommandInput,
  receivingInput,
  submittedAddressInput,
} from "../../../src/shared/contracts/receiving";
import { methodInput, timeCommandInput } from "../../../src/shared/contracts/receiving-time";
import { defaultShopTimeZone } from "../../../src/shared/datetime";
import { ApiError } from "../../../src/shared/errors";
import { authBodyLimit, validationFailure } from "../../auth/request";
import { sessionLimiter } from "../../auth/session-limit";
import { acceptsCheckout, type ShopEnv } from "../../shop/env";
import { readCustomer } from "../auth/service";
import { readAvailability, saveTime } from "./availability";
import { currentSelection } from "./current-selection";
import { lookupShopAddress } from "./geocoder";
import {
  checkFulfillment,
  emptySelection,
  publicFulfillment,
  readFulfillment,
  readReceiving,
  requireFulfillment,
  saveReceiving,
} from "./service";
import { storefrontReceiving } from "./storefront-receiving";

const geocodeLimit = sessionLimiter(20);
const verifyAddressLimit = sessionLimiter(20);
export const receivingRoutes = new Hono<ShopEnv>()
  .get("/next", (c) => {
    c.header("Cache-Control", "no-store");
    return c.json(storefrontReceiving(c.env.storage, c.env.features.maps, c.env.timeZone ?? defaultShopTimeZone));
  })
  .get("/availability", zValidator("query", z.object({ method: methodInput }), validationFailure), (c) => {
    const { method } = c.req.valid("query");
    const settings = readFulfillment(c.env.storage, c.env.features.maps);
    if (!settings[method]) throw new ApiError("NOT_FOUND", "Способ получения недоступен");
    return c.json(readAvailability(c.env.storage, method));
  })
  .post("/time", authBodyLimit, zValidator("json", timeCommandInput, validationFailure), async (c) => {
    const session = await readCustomer(c.env.db, c.req.raw, c.env.shop.id);
    if (!session) throw new ApiError("UNAUTHORIZED", "Нужна сессия покупателя");
    if (!acceptsCheckout(c.env)) throw new ApiError("FORBIDDEN", "Магазин временно закрыт");
    return c.json(saveTime(c.env.storage, session.subject, c.req.valid("json"), c.env.features.maps));
  })
  .get("/", async (c) => {
    const settings = readFulfillment(c.env.storage, c.env.features.maps);
    const session = await readCustomer(c.env.db, c.req.raw, c.env.shop.id);
    const stored = session ? readReceiving(c.env.storage, session.subject) : { revision: 0, ...emptySelection() };
    const saved = currentSelection(stored, settings);
    const availability = saved.receiving ? checkFulfillment(settings, saved.receiving) : null;
    return c.json({ ...saved, availability, ...publicFulfillment(settings, c.env.timeZone ?? defaultShopTimeZone) });
  })
  .post("/check", authBodyLimit, zValidator("json", receivingInput, validationFailure), (c) =>
    c.json(checkFulfillment(readFulfillment(c.env.storage, c.env.features.maps), c.req.valid("json"))),
  )
  .post("/geocode", authBodyLimit, zValidator("json", geocodeInput, validationFailure), async (c) => {
    const session = await readCustomer(c.env.db, c.req.raw, c.env.shop.id);
    if (!session) throw new ApiError("UNAUTHORIZED", "Нужна сессия покупателя");
    const mode = readFulfillment(c.env.storage, c.env.features.maps).delivery?.mode;
    if (mode !== "map" && mode !== "text") throw new ApiError("FEATURE_DISABLED", "Поиск по карте недоступен");
    geocodeLimit(c, session.sessionId);
    const results = await lookupShopAddress(c.env.shop.id, c.req.valid("json"));
    if (!results.length) throw new ApiError("ADDRESS_NOT_FOUND", "Не нашли такой адрес");
    return c.json({ results });
  })
  .post("/verify-address", authBodyLimit, zValidator("json", submittedAddressInput, validationFailure), async (c) => {
    const { db, storage, shop, features } = c.env;
    const session = await readCustomer(db, c.req.raw, shop.id);
    if (!session) throw new ApiError("UNAUTHORIZED", "Нужна сессия покупателя");
    const settings = readFulfillment(storage, features.maps);
    if (settings.delivery?.mode !== "map") throw new ApiError("FEATURE_DISABLED", "Проверка по карте недоступна");
    verifyAddressLimit(c, session.sessionId);
    const { address } = c.req.valid("json");
    const [place] = await lookupShopAddress(shop.id, { type: "search", address }, true);
    const point = place ? { lat: place.lat, lon: place.lon } : null;
    if (point) requireFulfillment(settings, { mode: "delivery", address, point }, false);
    return c.json({ point });
  })
  .post("/", authBodyLimit, zValidator("json", receiveCommandInput, validationFailure), async (c) => {
    const session = await readCustomer(c.env.db, c.req.raw, c.env.shop.id);
    if (!session) throw new ApiError("UNAUTHORIZED", "Нужна сессия покупателя");
    if (!acceptsCheckout(c.env)) throw new ApiError("FORBIDDEN", "Магазин временно закрыт");
    const saved = saveReceiving(c.env.storage, session.subject, c.req.valid("json"), c.env.features.maps);
    return c.json({ ...saved, ...currentSelection(saved, readFulfillment(c.env.storage, c.env.features.maps)) });
  });
