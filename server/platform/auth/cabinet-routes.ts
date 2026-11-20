import { exports } from "cloudflare:workers";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { telegramInput, telegramStartInput } from "../../../src/shared/contracts/auth";
import { ApiError } from "../../../src/shared/errors";
import type { AuthSecrets } from "../../auth/config";
import { sellerCookie, sessionCookie } from "../../auth/cookies";
import { authBodyLimit, authCommand, validationFailure } from "../../auth/request";
import { verifyInitData } from "../../auth/telegram";
import { telegramReturnUrl } from "../../auth/telegram-return";
import type { CommandVariables } from "../../middleware/idempotency";
import { browserCodePattern, finishSellerExchange, startSellerExchange } from "./browser-exchange";
import { enterCabinet, readCabinet } from "./cabinet";
import { ensureDemoTelegramWebhook, isDemoTelegramOrigin } from "./demo-telegram";
import { sellerTtl, telegramSellerSession } from "./sessions";

const cabinetQuery = z.object({
  store: z
    .string()
    .regex(/^[a-z0-9-]{1,63}$/)
    .optional(),
});
const cabinetLogin = telegramInput.extend(cabinetQuery.shape);

export const cabinetRoutes = new Hono<{ Bindings: Env & AuthSecrets; Variables: CommandVariables }>()
  .use("*", async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    await next();
  })
  .get("/", zValidator("query", cabinetQuery, validationFailure), async (c) =>
    c.json(await readCabinet(c.env.PLATFORM, c.req.raw, c.env.APP_ENV, c.req.valid("query").store)),
  )
  .post("/start", authBodyLimit, authCommand, zValidator("json", telegramStartInput, validationFailure), async (c) => {
    const returnUrl = telegramReturnUrl(c.req.raw, c.req.valid("json").returnPath ?? "/seller", true);
    if (c.env.APP_ENV === "demo" && isDemoTelegramOrigin(c.req.raw))
      await ensureDemoTelegramWebhook(c.env.PLATFORM, c.env);
    const { cookie, ...exchange } = await startSellerExchange(c.env.PLATFORM, c.env.PLATFORM_BOT_USERNAME, returnUrl);
    c.header("Set-Cookie", sessionCookie(c.req.raw, cookie.name, cookie.value, cookie.ttl));
    return c.json(exchange, 201);
  })
  .post(
    "/finish",
    authBodyLimit,
    authCommand,
    zValidator("json", z.strictObject({ exchange: z.string().regex(browserCodePattern) }), validationFailure),
    async (c) => {
      const result = await finishSellerExchange(c.env.PLATFORM, c.req.raw, c.req.valid("json").exchange);
      if (!result) return c.json({ pending: true }, 202);
      c.header("Set-Cookie", sessionCookie(c.req.raw, result.name, "", 0), { append: true });
      c.header("Set-Cookie", sessionCookie(c.req.raw, sellerCookie, result.token, sellerTtl), { append: true });
      return c.json({ pending: false });
    },
  )
  .post("/telegram", authBodyLimit, authCommand, zValidator("json", cabinetLogin, validationFailure), async (c) => {
    const { initData, store, bearer } = c.req.valid("json");
    const fromPlatform = async () => {
      if (!c.env.PLATFORM_BOT_TOKEN) return undefined;
      try {
        return await verifyInitData(initData, c.env.PLATFORM_BOT_TOKEN);
      } catch (error) {
        if (!(error instanceof ApiError) || error.code !== "UNAUTHORIZED") throw error;
      }
    };
    const shop = store
      ? await c.env.PLATFORM.withSession("first-primary")
          .prepare("SELECT id FROM shops WHERE slug=? AND status IN ('draft','active','paused')")
          .bind(store)
          .first<{ id: string }>()
      : null;
    if (store && !shop) throw new ApiError("SHOP_NOT_FOUND", "Магазин не найден");
    const platform = await fromPlatform();
    if (!platform && !shop) throw new ApiError("UNAUTHORIZED", "Войдите через Telegram");
    const telegramId =
      platform?.telegramId ??
      (shop
        ? await exports.Shop.get(exports.Shop.idFromName(shop.id)).verifyCabinetTelegram(initData, shop.id)
        : undefined);
    if (!telegramId) throw new ApiError("UNAUTHORIZED", "Войдите через Telegram");
    const token = shop
      ? await enterCabinet(c.env.PLATFORM, telegramId, shop.id)
      : await telegramSellerSession(c.env.PLATFORM, telegramId);
    if (!bearer) c.header("Set-Cookie", sessionCookie(c.req.raw, sellerCookie, token, sellerTtl));
    return c.json({ ok: true as const, ...(bearer && { token }) });
  });
