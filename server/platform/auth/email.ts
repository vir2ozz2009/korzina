import { ApiError } from "../../../src/shared/errors";
import { digest, newToken, tokenHash } from "../../auth/tokens";
import { scheduleSellerCleanup } from "../cleanup";
import { sellerTtl } from "./sessions";

function code() {
  const bytes = new Uint32Array(1);
  do {
    crypto.getRandomValues(bytes);
  } while (bytes[0] >= 4_294_000_000);
  return String(bytes[0] % 1_000_000).padStart(6, "0");
}
export async function startEmail(database: D1Database, email: string) {
  const challengeId = crypto.randomUUID();
  const devCode = code();
  await database
    .prepare("INSERT INTO email_challenges (id, email, code_hash, expires_at) VALUES (?, ?, ?, ?)")
    .bind(challengeId, email, await digest(`${challengeId}:${devCode}`), Date.now() + 10 * 60_000)
    .run();
  return { challengeId, devCode };
}
export async function verifyEmail(database: D1Database, challengeId: string, code: string): Promise<string> {
  const token = newToken();
  const nonce = crypto.randomUUID();
  const now = Date.now();
  const hash = await digest(`${challengeId}:${code}`);
  // One atomic batch: consume at most one valid code and insert its session. Failed guesses consume an attempt.
  const result = await database.batch([
    database
      .prepare(
        "UPDATE email_challenges SET attempts = attempts + 1, attempt_id = ? WHERE id = ? AND used_at IS NULL AND expires_at > ? AND attempts < 5",
      )
      .bind(nonce, challengeId, now),
    database
      .prepare(
        "INSERT INTO accounts (id, email) SELECT ?, email FROM email_challenges WHERE id = ? AND attempt_id = ? AND code_hash = ? AND used_at IS NULL ON CONFLICT(email) DO NOTHING",
      )
      .bind(crypto.randomUUID(), challengeId, nonce, hash),
    database
      .prepare(
        "INSERT INTO seller_sessions (token_hash, account_id, expires_at) SELECT ?, a.id, ? FROM accounts a JOIN email_challenges e ON a.email = e.email WHERE e.id = ? AND e.attempt_id = ? AND e.code_hash = ? AND e.used_at IS NULL",
      )
      .bind(await tokenHash(token), now + sellerTtl * 1000, challengeId, nonce, hash),
    database
      .prepare(
        "UPDATE email_challenges SET used_at = ? WHERE id = ? AND attempt_id = ? AND code_hash = ? AND used_at IS NULL",
      )
      .bind(now, challengeId, nonce, hash),
  ]);
  if (result[2].meta.changes !== 1) throw new ApiError("UNAUTHORIZED", "Код неверен или устарел");
  await scheduleSellerCleanup();
  return token;
}
