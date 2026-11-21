import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import lookupTimeZone from "tz-lookup";
import { pointInput } from "../../src/shared/contracts/receiving";
import { saveStoreProfile, saveStoreTheme } from "../../src/shared/contracts/seller-shop-profile";
import { ApiError } from "../../src/shared/errors";
import { authBodyLimit, validationFailure } from "../auth/request";
import { readSeller, type Seller } from "../auth/roles";
import { idempotency } from "../middleware/idempotency";
import { executeCommand } from "./commands";
import type { ShopEnv } from "./env";
import { ownerProfile, ownerTheme, putSetting, recordStoreRevision, writeStoreProfile } from "./profile-settings";

type SellerProfileEnv = ShopEnv & { Variables: ShopEnv["Variables"] & { seller: Seller } };
function command<T>(c: Context<SellerProfileEnv>, execute: () => T) {
  const { storage, db } = c.env;
  const { body } = executeCommand(
    storage,
    db,
    `seller:shop-profile:${c.get("seller").accountId}`,
    c.get("command"),
    () => ({
      status: 200,
      body: execute(),
    }),
  );
  return c.json(body);
}

export const sellerProfileRoutes = new Hono<SellerProfileEnv>()
  .use("*", async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    const seller = await readSeller(c.req.raw, c.env.platform, c.env.shop.id);
    if (c.req.method !== "GET" && seller.role !== "owner")
      throw new ApiError("FORBIDDEN", "Нет права изменять данные магазина");
    c.set("seller", seller);
    await next();
  })
  .get("/data", (c) => c.json(ownerProfile(c.env, c.get("seller"))))
  .get("/theme", (c) => c.json(ownerTheme(c.env, c.get("seller"))))
  .post("/time-zone", authBodyLimit, zValidator("json", pointInput, validationFailure), (c) => {
    const { lat, lon } = c.req.valid("json");
    return c.json({ timeZone: lookupTimeZone(lat, lon) });
  })
  .put(
    "/data",
    authBodyLimit,
    idempotency,
    async (c, next) => {
      const data: unknown = await c.req.json().catch(() => undefined);
      if (data && typeof data === "object" && ["country", "currency", "slug"].some((key) => key in data))
        throw new ApiError("FORBIDDEN", "Страну, валюту и адрес витрины меняет поддержка");
      await next();
    },
    zValidator("json", saveStoreProfile, validationFailure),
    (c) => {
      const { expectedRevision, ...profile } = c.req.valid("json");
      return command(c, () => writeStoreProfile(c.env, c.get("seller"), profile, expectedRevision));
    },
  )
  .put("/theme", authBodyLimit, idempotency, zValidator("json", saveStoreTheme, validationFailure), (c) => {
    const { theme, expectedRevision } = c.req.valid("json");
    return command(c, () => {
      recordStoreRevision(c.env.storage, "theme", c.get("seller"), expectedRevision);
      putSetting(c.env.storage, "theme", JSON.stringify(theme));
      return ownerTheme(c.env, c.get("seller"));
    });
  });
