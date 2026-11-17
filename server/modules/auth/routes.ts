import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { emptyInput, telegramInput } from "../../../src/shared/contracts/auth";
import { ApiError } from "../../../src/shared/errors";
import { decryptBotToken } from "../../auth/bot-token";
import { customerCookie, sessionCookie } from "../../auth/cookies";
import { authBodyLimit, authCommand, validationFailure } from "../../auth/request";
import { sessionLimiter } from "../../auth/session-limit";
import { verifyInitData } from "../../auth/telegram";
import { handleError } from "../../middleware/errors";
import { RateLimiter, rateLimit } from "../../middleware/rate-limit";
import type { ShopEnv } from "../../shop/env";
import { settings } from "../../shop/schema";
import { createCustomer, customerTtl, logoutCustomer, readCustomer } from "./service";

const limitCustomer = sessionLimiter();
const publicSession = ({ subject, kind, expiresAt }: { subject: string; kind: string; expiresAt: number }) => ({
  subject,
  kind,
  expiresAt,
});
export const customerAuth = new Hono<ShopEnv>()
  .onError(handleError)
  .use("*", authBodyLimit, authCommand)
  .use(
    "*",
    rateLimit(new RateLimiter(30), (request) => request.headers.get("x-korzina-client") ?? "local"),
  )
  .post("/guest", zValidator("json", emptyInput, validationFailure), async (c) => {
    const existing = await readCustomer(c.env.db, c.req.raw, c.env.shop.id);
    if (existing) {
      limitCustomer(c, existing.sessionId);
      return c.json(publicSession(existing), 200);
    }
    const created = await createCustomer(c.env.db);
    c.header("Set-Cookie", sessionCookie(c.req.raw, customerCookie(c.env.shop.id), created.token, customerTtl));
    return c.json(created.session, 201);
  })
  .post("/telegram", zValidator("json", telegramInput, validationFailure), async (c) => {
    const input = c.req.valid("json");
    const configured = c.env.db
      .select({ value: settings.value })
      .from(settings)
      .where(eq(settings.key, "telegram_bot_token"))
      .get();
    const botToken = await decryptBotToken(configured?.value, c.env.shop.id, c.env.secrets.ENCRYPTION_KEY);
    const { telegramId } = await verifyInitData(input.initData, botToken);
    const created = await createCustomer(c.env.db, `telegram:${telegramId}`, "telegram");
    c.header("Set-Cookie", sessionCookie(c.req.raw, customerCookie(c.env.shop.id), created.token, customerTtl));
    return c.json({ ...created.session, ...(input.bearer ? { token: created.token } : {}) }, 201);
  })
  .get("/session", async (c) => {
    const session = await readCustomer(c.env.db, c.req.raw, c.env.shop.id);
    if (!session) throw new ApiError("UNAUTHORIZED", "Нет сессии");
    limitCustomer(c, session.sessionId);
    return c.json(publicSession(session));
  })
  .post("/logout", zValidator("json", emptyInput, validationFailure), async (c) => {
    await logoutCustomer(c.env.db, c.req.raw, c.env.shop.id);
    c.header("Set-Cookie", sessionCookie(c.req.raw, customerCookie(c.env.shop.id), "", 0));
    return c.json({ ok: true });
  });
