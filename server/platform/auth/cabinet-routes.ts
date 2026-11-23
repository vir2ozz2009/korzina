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
import { resolveShop } from "../resolve-shop";
import { staffBot, staffBotToken } from "../team/bot";
import { browserCodePattern, finishSellerExchange, startSellerExchange } from "./browser-exchange";
import { enterCabinet, readCabinet } from "./cabinet";
import { sellerTtl } from "./sessions";

const cabinetQuery = z.object({
  store: z
    .string()
    .regex(/^[a-z0-9-]{1,63}$/)
    .optional(),
});
const cabinetLogin = telegramInput.extend(cabinetQuery.shape);
const cabinetStart = telegramStartInput.extend(cabinetQuery.shape);

async function cabinetShop(env: Env, request: Request, store?: string) {
  const shop = store
    ? await env.PLATFORM.withSession("first-primary")
        .prepare("SELECT id FROM shops WHERE slug=? AND status IN ('draft','active','paused')")
        .bind(store)
        .first<{ id: string }>()
    : await resolveShop(request, env.PLATFORM, env.APP_ENV);
  if (!shop) throw new ApiError("SHOP_NOT_FOUND", "Откройте кабинет из магазина");
  return shop;
}

export const cabinetRoutes = new Hono<{ Bindings: Env & AuthSecrets; Variables: CommandVariables }>()
  .use("*", async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    await next();
  })
  .get("/", zValidator("query", cabinetQuery, validationFailure), async (c) =>
    c.json(await readCabinet(c.env.PLATFORM, c.req.raw, c.env.APP_ENV, c.req.valid("query").store)),
  )
  .post("/start", authBodyLimit, authCommand, zValidator("json", cabinetStart, validationFailure), async (c) => {
    const { returnPath, store } = c.req.valid("json");
    const returnUrl = telegramReturnUrl(c.req.raw, returnPath ?? "/seller", true);
    const shop = await cabinetShop(c.env, c.req.raw, store);
    const bot = await staffBot(c.env.PLATFORM, shop.id);
    if (!bot) throw new ApiError("AUTH_UNAVAILABLE", "Telegram магазина пока не подключён");
    const { cookie, ...exchange } = await startSellerExchange(c.env.PLATFORM, shop.id, bot, returnUrl);
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
    const shop = await cabinetShop(c.env, c.req.raw, store);
    const botToken = await staffBotToken(await staffBot(c.env.PLATFORM, shop.id), shop.id, c.env);
    if (!botToken) throw new ApiError("AUTH_UNAVAILABLE", "Telegram магазина пока не подключён");
    const { telegramId } = await verifyInitData(initData, botToken);
    const token = await enterCabinet(c.env.PLATFORM, telegramId, shop.id);
    if (!bearer) c.header("Set-Cookie", sessionCookie(c.req.raw, sellerCookie, token, sellerTtl));
    return c.json({ ok: true as const, ...(bearer && { token }) });
  });
