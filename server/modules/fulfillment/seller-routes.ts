import { exports } from "cloudflare:workers";
import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { fulfillmentSettingsInput } from "../../../src/shared/contracts/receiving";
import {
  saveReceivingHours,
  saveReceivingPause,
  saveReceivingSettings,
  sellerCityInput,
  sellerDeliveryCheck,
} from "../../../src/shared/contracts/seller-receiving";
import { ApiError } from "../../../src/shared/errors";
import { validationFailure } from "../../auth/request";
import { readSeller, type Seller } from "../../auth/roles";
import { sessionLimiter } from "../../auth/session-limit";
import { idempotency } from "../../middleware/idempotency";
import { executeCommand } from "../../shop/commands";
import type { ShopEnv } from "../../shop/env";
import { deliveryCities } from "./city";
import { geocodeAddress } from "./geocoder";
import { checkFulfillment } from "./service";
import {
  readReceivingHours,
  readReceivingPauses,
  readReceivingSettings,
  updateReceivingHours,
  updateReceivingPauses,
  updateReceivingSettings,
} from "./settings";

type ReceivingEnv = ShopEnv & { Variables: ShopEnv["Variables"] & { seller: Seller } };
const limitLookup = sessionLimiter(20);

function requireWrite(c: Context<ReceivingEnv>, pause = false) {
  const seller = c.get("seller");
  if (seller.role !== "owner" && !(pause && seller.permissions.includes("orders")))
    throw new ApiError("FORBIDDEN", "Нет права изменять настройки");
  return seller;
}

function command<T>(c: Context<ReceivingEnv>, execute: () => T) {
  const { storage, db } = c.env;
  const scope = `seller:receiving:${c.get("seller").accountId}`;
  const { body } = executeCommand(storage, db, scope, c.get("command"), () => ({ status: 200, body: execute() }));
  return c.json(body);
}

export const sellerReceivingRoutes = new Hono<ReceivingEnv>()
  .use("*", async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    c.set("seller", await readSeller(c.req.raw, c.env.platform, c.env.shop.id));
    await next();
  })
  .get("/settings", (c) => c.json(readReceivingSettings(c.env, c.get("seller"))))
  .get("/hours", (c) => c.json(readReceivingHours(c.env, c.get("seller"))))
  .get("/pause", (c) => c.json(readReceivingPauses(c.env, c.get("seller"))))
  .use(
    "*",
    bodyLimit({
      maxSize: 196_608,
      onError: () => {
        throw new ApiError("PAYLOAD_TOO_LARGE", "Слишком большой запрос");
      },
    }),
  )
  .post("/city", zValidator("json", sellerCityInput, validationFailure), async (c) => {
    const seller = requireWrite(c);
    if (!c.env.features.maps) throw new ApiError("FEATURE_DISABLED", "Карта отключена");
    limitLookup(c, seller.accountId);
    const coordinator = exports.Shop.get(exports.Shop.idFromName("geocoder:osm"));
    const cache = await caches.open("shop-geocoding");
    const results = await deliveryCities(c.req.valid("json").city, cache, () => coordinator.allowGeocoder("nominatim"));
    if (!results.length) throw new ApiError("ADDRESS_NOT_FOUND", "Не нашли такой город");
    return c.json({ results });
  })
  .post("/check", zValidator("json", sellerDeliveryCheck, validationFailure), async (c) => {
    const seller = requireWrite(c);
    const { delivery, receiving, geocode } = c.req.valid("json");
    if (delivery?.mode === "map" && !c.env.features.maps) throw new ApiError("FEATURE_DISABLED", "Карта отключена");
    const settings = fulfillmentSettingsInput.parse({ delivery });
    if (!geocode) return c.json({ availability: checkFulfillment(settings, receiving) });
    if (delivery?.mode !== "map" || receiving.mode !== "delivery")
      throw new ApiError("VALIDATION", "Проверка по карте недоступна");
    limitLookup(c, seller.accountId);
    const coordinator = exports.Shop.get(exports.Shop.idFromName("geocoder:osm"));
    const cache = await caches.open("shop-geocoding");
    const results = await geocodeAddress(
      c.env.shop.id,
      geocode,
      cache,
      (provider) => coordinator.allowGeocoder(provider),
      { submittedSearch: true },
    );
    const result = results[0];
    if (!result) throw new ApiError("ADDRESS_NOT_FOUND", "Не нашли такой адрес");
    return c.json({ results, availability: checkFulfillment(settings, { ...receiving, point: result }) });
  })
  .put("/settings", idempotency, zValidator("json", saveReceivingSettings, validationFailure), (c) => {
    const seller = requireWrite(c);
    return command(c, () => updateReceivingSettings(c.env, seller, c.req.valid("json")));
  })
  .put("/hours", idempotency, zValidator("json", saveReceivingHours, validationFailure), (c) => {
    const seller = requireWrite(c);
    return command(c, () => updateReceivingHours(c.env, seller, c.req.valid("json")));
  })
  .put("/pause", idempotency, zValidator("json", saveReceivingPause, validationFailure), (c) => {
    const seller = requireWrite(c, true);
    return command(c, () => updateReceivingPauses(c.env, seller, c.req.valid("json")));
  });
