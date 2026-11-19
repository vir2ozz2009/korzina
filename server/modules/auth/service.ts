import { eq } from "drizzle-orm";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { ApiError } from "../../../src/shared/errors";
import { credential, customerCookie } from "../../auth/cookies";
import { newToken, tokenHash } from "../../auth/tokens";
import { sessions } from "../../shop/schema";

export const customerTtl = 30 * 86_400;

export function extendCustomerVisit(storage: DurableObjectStorage, sessionId: string) {
  const now = Date.now();
  const expiresAt = now + customerTtl * 1000;
  return (
    storage.sql
      .exec(
        "UPDATE sessions SET expires_at=? WHERE token_hash=? AND kind='telegram' AND expires_at>? AND expires_at<? RETURNING 1",
        expiresAt,
        sessionId,
        now,
        expiresAt,
      )
      .toArray().length > 0
  );
}

export async function readCustomerWith<T extends Pick<typeof sessions.$inferSelect, "subject" | "kind" | "expiresAt">>(
  request: Request,
  shopId: string,
  find: (sessionId: string) => T | undefined | Promise<T | undefined>,
) {
  const token = credential(request, customerCookie(shopId));
  if (!token) return undefined;
  const sessionId = await tokenHash(token);
  const row = await find(sessionId);
  if (!row || row.expiresAt <= Date.now()) throw new ApiError("UNAUTHORIZED", "Сессия недействительна");
  return { ...row, sessionId };
}

export function readCustomer(db: DrizzleSqliteDODatabase, request: Request, shopId: string) {
  return readCustomerWith(request, shopId, (sessionId) =>
    db
      .select({ subject: sessions.subject, kind: sessions.kind, expiresAt: sessions.expiresAt })
      .from(sessions)
      .where(eq(sessions.tokenHash, sessionId))
      .get(),
  );
}

export async function prepareCustomer(subject = `guest:${crypto.randomUUID()}`, kind: "guest" | "telegram" = "guest") {
  const token = newToken();
  const expiresAt = Date.now() + customerTtl * 1000;
  return { token, tokenHash: await tokenHash(token), session: { subject, kind, expiresAt } };
}

export function writeCustomer(db: DrizzleSqliteDODatabase, prepared: Awaited<ReturnType<typeof prepareCustomer>>) {
  db.insert(sessions)
    .values({ tokenHash: prepared.tokenHash, ...prepared.session })
    .run();
}

export async function createCustomer(db: DrizzleSqliteDODatabase) {
  const prepared = await prepareCustomer();
  writeCustomer(db, prepared);
  return prepared;
}
export async function logoutCustomer(db: DrizzleSqliteDODatabase, request: Request, shopId: string) {
  const token = credential(request, customerCookie(shopId));
  if (token)
    db.delete(sessions)
      .where(eq(sessions.tokenHash, await tokenHash(token)))
      .run();
}
