import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { deliveryAddressInput, fulfillmentInput, geocodeInput } from "../../../src/shared/contracts/fulfillment";
import { ApiError } from "../../../src/shared/errors";
import { authBodyLimit, validationFailure } from "../../auth/request";
import { sessionLimiter } from "../../auth/session-limit";
import type { ShopEnv } from "../../shop/env";
import { readCustomer } from "../auth/service";
import { geocodeAddress } from "./geocoder";
import { checkFulfillment, readFulfillment, rememberAddress, savedAddresses } from "./service";

const geocodeLimit = sessionLimiter(20);
export const fulfillmentRoutes = new Hono<ShopEnv>()
  .get("/", (c) => {
    const settings = readFulfillment(c.env.storage);
    return c.json({ delivery: !!settings.delivery, pickup: settings.pickup ?? null });
  })
  .post("/check", authBodyLimit, zValidator("json", fulfillmentInput, validationFailure), (c) =>
    c.json(checkFulfillment(readFulfillment(c.env.storage), c.req.valid("json"))),
  )
  .post("/geocode", authBodyLimit, zValidator("json", geocodeInput, validationFailure), async (c) => {
    const session = await readCustomer(c.env.db, c.req.raw, c.env.shop.id);
    if (!session) throw new ApiError("UNAUTHORIZED", "Нужна сессия покупателя");
    geocodeLimit(c, session.sessionId);
    const cache = await caches.open("shop-geocoding");
    return c.json({
      result: await geocodeAddress(c.env.shop.id, c.req.valid("json").address, c.env.secrets.GEOAPIFY_API_KEY, cache),
    });
  })
  .get("/addresses", async (c) => {
    const session = await readCustomer(c.env.db, c.req.raw, c.env.shop.id);
    return c.json({ addresses: session ? savedAddresses(c.env.storage, session.sessionId) : [] });
  })
  .post("/addresses", authBodyLimit, zValidator("json", deliveryAddressInput, validationFailure), async (c) => {
    const session = await readCustomer(c.env.db, c.req.raw, c.env.shop.id);
    if (!session) throw new ApiError("UNAUTHORIZED", "Нужна сессия покупателя");
    return c.json(rememberAddress(c.env.storage, session.sessionId, c.req.valid("json")));
  });
