export const day = 86_400_000;
const batchSize = 100;

// Called only after a write created expiring work; repeated commands do not arm it.
export async function scheduleCleanup(storage: DurableObjectStorage, now = Date.now()) {
  const existing = await storage.getAlarm();
  if (existing === null || existing > now + day) await storage.setAlarm(now + day);
}
export function cleanupRecords(storage: DurableObjectStorage, now = Date.now(), maxTables = 4) {
  return storage.transactionSync(() => {
    const statements = [
      ["idempotency", "created_at<?", [now - day]],
      ["sessions", "expires_at<=?", [now]],
      ["receiving_seats", "expires_at<=?", [now]],
      ["customer_telegram_exchanges", "expires_at<=?", [now]],
      ["checkout_quotes", "expires_at<=?", [now]],
      ["checkout_receipts", "expires_at<=?", [now]],
      [
        "carts",
        "updated_at<? AND NOT EXISTS(SELECT 1 FROM sessions s WHERE s.subject=carts.customer AND s.expires_at>?)",
        [now - 30 * day, now],
      ],
    ] as const;
    const due = storage.sql
      .exec<Record<string, number>>(
        `SELECT ${statements.map(([table, where]) => `EXISTS(SELECT 1 FROM ${table} WHERE ${where}) AS ${table}`).join(",")}`,
        ...statements.flatMap(([, , bindings]) => [...bindings]),
      )
      .one();
    const expired = statements.filter(([table]) => due[table]);
    let more = expired.length > maxTables;
    for (const [table, where, bindings] of expired.slice(0, maxTables)) {
      const deleted = storage.sql.exec(
        `DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE ${where} LIMIT ${batchSize})`,
        ...bindings,
      );
      more ||= deleted.rowsWritten >= batchSize;
    }
    return more;
  });
}
export async function rescheduleCleanup(storage: DurableObjectStorage, more: boolean, now = Date.now()) {
  if (more) return storage.setAlarm(now + 1000);
  const row = storage.sql
    .exec<Record<string, number | null>>(
      `SELECT
       (SELECT MIN(created_at)+${day} FROM idempotency) AS commands,
       (SELECT MIN(expires_at) FROM sessions) AS sessions,
       (SELECT MIN(expires_at) FROM media) AS media,
       (SELECT MIN(expires_at) FROM receiving_seats) AS seats,
       (SELECT MIN(expires_at) FROM customer_telegram_exchanges) AS exchanges,
       (SELECT MIN(expires_at) FROM checkout_quotes) AS checkout_quotes,
       (SELECT MIN(expires_at) FROM checkout_receipts) AS checkout_receipts,
       (SELECT MIN(updated_at)+${30 * day} FROM carts WHERE NOT EXISTS(
         SELECT 1 FROM sessions s WHERE s.subject=carts.customer AND s.expires_at>?)) AS cart_drafts`,
      now,
    )
    .one();
  const due = Math.min(...Object.values(row).filter((value) => value !== null));
  if (!Number.isFinite(due)) await storage.deleteAlarm();
  else await storage.setAlarm(Math.max(now + 1000, Math.min(due, now + day)));
}
