import { eq } from "drizzle-orm";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { ApiError } from "../../../src/shared/errors";
import { credential, customerCookie } from "../../auth/cookies";
import { newToken, tokenHash } from "../../auth/tokens";
import { sessions } from "../../shop/schema";

export const customerTtl = 30 * 86_400;
export async function readCustomer(db: DrizzleSqliteDODatabase, request: Request, shopId: string) {
  const token = credential(request, customerCookie(shopId));
  if (!token) return undefined;
  const row = db
    .select({ subject: sessions.subject, kind: sessions.kind, expiresAt: sessions.expiresAt })
    .from(sessions)
    .where(eq(sessions.tokenHash, await tokenHash(token)))
    .get();
  if (!row || row.expiresAt <= Date.now()) throw new ApiError("UNAUTHORIZED", "Сессия недействительна");
  return { ...row, sessionId: await tokenHash(token) };
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
