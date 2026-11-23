import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { emptyInput } from "../../../src/shared/contracts/auth";
import { addressCommand, profileInput } from "../../../src/shared/contracts/profile";
import { ApiError } from "../../../src/shared/errors";
import { sellerCookie, sessionCookie } from "../../auth/cookies";
import { authBodyLimit, authCommand, validationFailure } from "../../auth/request";
import { adminCookie, isPlatformAdmin, openAdminSession } from "../../platform/admin/access";
import { canEnterCabinet, customerTelegramId, enterCabinet } from "../../platform/auth/cabinet";
import { sellerTtl } from "../../platform/auth/sessions";
import { executeCommand } from "../../shop/commands";
import type { ShopEnv } from "../../shop/env";
import { contactRegion } from "../auth/contact";
import { readCustomer } from "../auth/service";
import { editableProfile, editProfile, profileAddresses, updateProfileAddress } from "./service";

async function actor(env: ShopEnv["Bindings"], request: Request) {
  const session = await readCustomer(env.db, request, env.shop.id);
  if (!session) throw new ApiError("UNAUTHORIZED", "Войдите в магазин");
  return session;
}

export const profileRoutes = new Hono<ShopEnv>()
  .use("*", async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    await next();
  })
  .get("/", async (c) => {
    const session = await actor(c.env, c.req.raw);
    const profile = editableProfile(c.env.storage, session);
    const telegramId = customerTelegramId(session);
    const sellerCabinet = await canEnterCabinet(c.env.platform, telegramId, c.env.shop.id);
    const platformAdmin = isPlatformAdmin(telegramId, c.env.secrets.PLATFORM_ADMIN_TELEGRAM_IDS);
    return c.json({ ...profile, region: contactRegion(c.env.storage), sellerCabinet, platformAdmin });
  })
  .post("/admin", authBodyLimit, authCommand, zValidator("json", emptyInput, validationFailure), async (c) => {
    const session = await actor(c.env, c.req.raw);
    const result = await openAdminSession(
      c.env.platform,
      c.env.secrets,
      customerTelegramId(session),
      session.expiresAt,
    );
    c.header("Set-Cookie", sessionCookie(c.req.raw, adminCookie, result.token, result.ttl));
    return c.json({ ok: true as const });
  })
  .post("/seller", authBodyLimit, authCommand, zValidator("json", emptyInput, validationFailure), async (c) => {
    const session = await actor(c.env, c.req.raw);
    const token = await enterCabinet(c.env.platform, customerTelegramId(session), c.env.shop.id);
    c.header("Set-Cookie", sessionCookie(c.req.raw, sellerCookie, token, sellerTtl));
    return c.json({ ok: true as const });
  })
  .post("/", authBodyLimit, authCommand, zValidator("json", profileInput, validationFailure), async (c) => {
    const session = await actor(c.env, c.req.raw);
    const { storage, db } = c.env;
    const { body } = executeCommand(storage, db, `profile:${session.subject}`, c.get("command"), () => ({
      status: 200,
      body: editProfile(storage, session, c.req.valid("json")),
    }));
    return c.json(body);
  })
  .get("/addresses", async (c) => c.json(profileAddresses(c.env.storage, await actor(c.env, c.req.raw))))
  .post("/addresses", authBodyLimit, authCommand, zValidator("json", addressCommand, validationFailure), async (c) => {
    const session = await actor(c.env, c.req.raw);
    const { storage, db, features } = c.env;
    const { body } = executeCommand(storage, db, `addresses:${session.subject}`, c.get("command"), () => ({
      status: 200,
      body: updateProfileAddress(storage, session, c.req.valid("json"), features.maps),
    }));
    return c.json(body);
  });
