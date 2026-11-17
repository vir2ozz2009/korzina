import { and, eq } from "drizzle-orm";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { ApiError } from "../../src/shared/errors";
import type { CommandIdentity } from "../middleware/idempotency";
import { idempotency } from "./schema";

export type CommandResult<T = unknown> = { body: T; status: number; headers?: Record<string, string> };

// The caller supplies a VERIFIED actor/session scope, never a request header. No external I/O in execute.
export function executeCommand<T>(
  storage: DurableObjectStorage,
  db: DrizzleSqliteDODatabase,
  scope: string,
  identity: CommandIdentity,
  execute: () => CommandResult<T>,
): CommandResult<T> {
  return storage.transactionSync(() => {
    const previous = db
      .select({ fingerprint: idempotency.fingerprint, response: idempotency.response })
      .from(idempotency)
      .where(and(eq(idempotency.scope, scope), eq(idempotency.key, identity.key)))
      .get();
    if (previous) {
      if (previous.fingerprint !== identity.fingerprint)
        throw new ApiError("IDEMPOTENCY_CONFLICT", "Ключ уже использован с другим запросом");
      return JSON.parse(previous.response) as CommandResult<T>;
    }
    const result = execute();
    if (result.status < 200 || result.status >= 300) throw new Error("Commands must throw on failure");
    db.insert(idempotency)
      .values({
        scope,
        key: identity.key,
        fingerprint: identity.fingerprint,
        response: JSON.stringify(result),
        createdAt: Date.now(),
      })
      .run();
    return result;
  });
}
