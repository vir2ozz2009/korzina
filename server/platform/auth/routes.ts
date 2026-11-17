import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { emailStartInput, emailVerifyInput, emptyInput, telegramInput } from "../../../src/shared/contracts/auth";
import { ApiError } from "../../../src/shared/errors";
import type { AuthSecrets } from "../../auth/config";
import { isLocal, sellerCookie, sessionCookie } from "../../auth/cookies";
import { authBodyLimit, authCommand, validationFailure } from "../../auth/request";
import { verifyInitData } from "../../auth/telegram";
import type { CommandVariables } from "../../middleware/idempotency";
import { RateLimiter, rateLimit } from "../../middleware/rate-limit";
import { startEmail, verifyEmail } from "./email";
import { logoutSeller, sellerAccount, sellerTtl, telegramSellerSession } from "./sessions";

export const platformAuth = new Hono<{ Bindings: Env & AuthSecrets; Variables: CommandVariables }>()
  .use("*", authBodyLimit, authCommand)
  .use(
    "*",
    rateLimit(new RateLimiter(15), (request) => request.headers.get("CF-Connecting-IP") ?? "local"),
  )
  .post("/email/start", zValidator("json", emailStartInput, validationFailure), async (c) => {
    // The task permits a dev delivery stub. Never disclose a code on a deployed host or log it.
    if (!isLocal(c.req.raw)) throw new ApiError("AUTH_UNAVAILABLE", "Отправка кодов email пока не подключена");
    return c.json(await startEmail(c.env.PLATFORM, c.req.valid("json").email), 201);
  })
  .post("/email/verify", zValidator("json", emailVerifyInput, validationFailure), async (c) => {
    const { challengeId, code } = c.req.valid("json");
    const token = await verifyEmail(c.env.PLATFORM, challengeId, code);
    c.header("Set-Cookie", sessionCookie(c.req.raw, sellerCookie, token, sellerTtl));
    return c.json({ ok: true });
  })
  .post("/telegram", zValidator("json", telegramInput, validationFailure), async (c) => {
    if (!c.env.PLATFORM_BOT_TOKEN) throw new ApiError("AUTH_UNAVAILABLE", "Бот платформы пока не настроен");
    const { telegramId } = await verifyInitData(c.req.valid("json").initData, c.env.PLATFORM_BOT_TOKEN);
    const token = await telegramSellerSession(c.env.PLATFORM, telegramId);
    c.header("Set-Cookie", sessionCookie(c.req.raw, sellerCookie, token, sellerTtl));
    return c.json({ ok: true, ...(c.req.valid("json").bearer ? { token } : {}) });
  })
  .get("/session", async (c) => c.json({ accountId: await sellerAccount(c.env.PLATFORM, c.req.raw) }))
  .post("/logout", zValidator("json", emptyInput, validationFailure), async (c) => {
    await logoutSeller(c.env.PLATFORM, c.req.raw);
    c.header("Set-Cookie", sessionCookie(c.req.raw, sellerCookie, "", 0));
    return c.json({ ok: true });
  });
