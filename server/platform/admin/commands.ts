import { ApiError } from "../../../src/shared/errors";
import type { CommandIdentity } from "../../middleware/idempotency";

export async function platformReplay<T>(database: D1Database, accountId: string, command: CommandIdentity) {
  const prior = await database
    .withSession("first-primary")
    .prepare("SELECT fingerprint,result FROM platform_commands WHERE account_id=? AND key=?")
    .bind(accountId, command.key)
    .first<{ fingerprint: string; result: string }>();
  if (!prior) return undefined;
  if (prior.fingerprint !== command.fingerprint)
    throw new ApiError("IDEMPOTENCY_CONFLICT", "Ключ уже использован с другим запросом");
  return JSON.parse(prior.result) as T;
}

export function commandResult(
  database: D1Database,
  accountId: string,
  command: CommandIdentity,
  result: unknown,
  now: number,
) {
  return database
    .prepare("INSERT INTO platform_commands(account_id,key,fingerprint,result,created_at) VALUES(?,?,?,?,?)")
    .bind(accountId, command.key, command.fingerprint, JSON.stringify(result), now);
}

export function auditEvent(
  database: D1Database,
  shopId: string,
  actorId: string,
  action: string,
  changed: unknown,
  now: number,
) {
  return database
    .prepare("INSERT INTO platform_audit(id,shop_id,actor_id,action,changed,created_at) VALUES(?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), shopId, actorId, action, JSON.stringify(changed), now);
}
