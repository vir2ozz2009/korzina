import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import {
  emptyInput,
  phoneContactInput,
  telegramExchangeInput,
  telegramInput,
} from "../../../src/shared/contracts/auth";
import { ApiError } from "../../../src/shared/errors";
import { decryptBotToken } from "../../auth/bot-token";
import { customerCookie, sessionCookie } from "../../auth/cookies";
import { authBodyLimit, authCommand, validationFailure } from "../../auth/request";
import { sessionLimiter } from "../../auth/session-limit";
import { verifyInitData } from "../../auth/telegram";
import { digest } from "../../auth/tokens";
import { handleError } from "../../middleware/errors";
import { RateLimiter, rateLimit } from "../../middleware/rate-limit";
import type { ShopEnv } from "../../shop/env";
import { settings } from "../../shop/schema";
import { mergeCustomerCarts } from "../cart/service";
import { mergeCustomerFavorites } from "../favorites/service";
import { contactRegion, readContact, savePhone } from "./contact";
import { createCustomer, customerTtl, logoutCustomer, prepareCustomer, readCustomer, writeCustomer } from "./service";
import { confirmExchange, findExchange, startExchange, verifiedExchange } from "./telegram-exchange";

const limitCustomer = sessionLimiter();
const publicSession = ({ subject, kind, expiresAt }: { subject: string; kind: string; expiresAt: number }) => ({
  subject,
  kind,
  expiresAt,
});

function attachGuest(env: ShopEnv["Bindings"], session: Awaited<ReturnType<typeof readCustomer>>, target: string) {
  if (session?.kind !== "guest") return;
  mergeCustomerCarts(env.storage, session.subject, target, {
    id: env.shop.id,
    mediaOrigin: env.media.MEDIA_PUBLIC_URL,
  });
  mergeCustomerFavorites(env.storage, session.subject, target);
  env.storage.sql.exec("DELETE FROM sessions WHERE subject=? AND kind='guest'", session.subject);
}

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
  .get("/contact", async (c) => {
    const session = await readCustomer(c.env.db, c.req.raw, c.env.shop.id);
    const contact = session
      ? readContact(c.env.storage, session.subject, session.kind)
      : { phone: null, telegramLinked: false };
    return c.json({ ...contact, region: contactRegion(c.env.storage) });
  })
  .post("/contact", zValidator("json", phoneContactInput, validationFailure), async (c) => {
    const existing = await readCustomer(c.env.db, c.req.raw, c.env.shop.id);
    const prepared = existing ? undefined : await prepareCustomer();
    const session = existing ?? prepared?.session;
    if (!session) throw new ApiError("UNAUTHORIZED", "Нужна сессия покупателя");
    const result = c.env.storage.transactionSync(() => {
      const contact = savePhone(c.env.storage, session.subject, session.kind, c.req.valid("json").phone);
      if (prepared) writeCustomer(c.env.db, prepared);
      return contact;
    });
    if (prepared)
      c.header("Set-Cookie", sessionCookie(c.req.raw, customerCookie(c.env.shop.id), prepared.token, customerTtl));
    return c.json(result);
  })
  .post("/telegram/start", zValidator("json", emptyInput, validationFailure), async (c) => {
    const existing = await readCustomer(c.env.db, c.req.raw, c.env.shop.id);
    let owner = existing?.sessionId;
    const prepared = owner ? undefined : await prepareCustomer();
    if (prepared) owner = prepared.tokenHash;
    if (!owner) throw new ApiError("UNAUTHORIZED", "Нужна сессия покупателя");
    if (existing) limitCustomer(c, existing.sessionId);
    const result = await startExchange(c.env.storage, owner);
    if (prepared) {
      writeCustomer(c.env.db, prepared);
      c.header("Set-Cookie", sessionCookie(c.req.raw, customerCookie(c.env.shop.id), prepared.token, customerTtl));
    }
    return c.json(result);
  })
  .post("/telegram/finish", zValidator("json", telegramExchangeInput, validationFailure), async (c) => {
    const existing = await readCustomer(c.env.db, c.req.raw, c.env.shop.id);
    if (!existing) throw new ApiError("UNAUTHORIZED", "Нужна исходная сессия покупателя");
    limitCustomer(c, existing.sessionId);
    const id = await digest(c.req.valid("json").exchange);
    const target = findExchange(c.env.storage, id, existing.sessionId);
    if (!target) return c.json({ pending: true }, 202);
    const prepared = await prepareCustomer(target, "telegram");
    c.env.storage.transactionSync(() => {
      if (findExchange(c.env.storage, id, existing.sessionId) !== target)
        throw new ApiError("AUTH_FAILED", "Время входа через Telegram истекло");
      attachGuest(c.env, existing, target);
      writeCustomer(c.env.db, prepared);
      c.env.storage.sql.exec("DELETE FROM customer_telegram_exchanges WHERE id=?", id);
    });
    c.header("Set-Cookie", sessionCookie(c.req.raw, customerCookie(c.env.shop.id), prepared.token, customerTtl));
    return c.json({ ...prepared.session, pending: false });
  })
  .post("/telegram", zValidator("json", telegramInput, validationFailure), async (c) => {
    const input = c.req.valid("json");
    const configured = c.env.db
      .select({ value: settings.value })
      .from(settings)
      .where(eq(settings.key, "telegram_bot_token"))
      .get();
    const botToken = await decryptBotToken(configured?.value, c.env.shop.id, c.env.secrets.ENCRYPTION_KEY);
    const { telegramId, startParam } = await verifyInitData(input.initData, botToken);
    const exchange = await verifiedExchange(startParam);
    const existing = await readCustomer(c.env.db, c.req.raw, c.env.shop.id);
    const created = await prepareCustomer(`telegram:${telegramId}`, "telegram");
    c.env.storage.transactionSync(() => {
      attachGuest(c.env, existing, created.session.subject);
      writeCustomer(c.env.db, created);
      if (exchange) confirmExchange(c.env.storage, exchange, created.session.subject);
    });
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
