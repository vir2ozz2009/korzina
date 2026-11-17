export const day = 86_400_000;
const batchSize = 100;

// Called only after a write created expiring work; repeated commands do not arm it.
export async function scheduleCleanup(storage: DurableObjectStorage, now = Date.now()) {
  const existing = await storage.getAlarm();
  if (existing === null || existing > now + day) await storage.setAlarm(now + day);
}
export function cleanupRecords(storage: DurableObjectStorage, now = Date.now()) {
  return storage.transactionSync(() => {
    const statements = [
      ["idempotency", "created_at<?", [now - day]],
      ["sessions", "expires_at<=?", [now]],
      [
        "carts",
        "updated_at<? AND NOT EXISTS(SELECT 1 FROM sessions s WHERE s.subject=carts.customer AND s.expires_at>?)",
        [now - 30 * day, now],
      ],
    ] as const;
    let more = false;
    for (const [table, where, bindings] of statements) {
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
    .exec<{ due: number | null }>(
      `SELECT MIN(due) AS due FROM (
    SELECT MIN(created_at)+${day} AS due FROM idempotency
    UNION ALL SELECT MIN(expires_at) FROM sessions
    UNION ALL SELECT MIN(expires_at) FROM media
    UNION ALL SELECT MIN(updated_at)+${30 * day} FROM carts WHERE NOT EXISTS(
      SELECT 1 FROM sessions s WHERE s.subject=carts.customer AND s.expires_at>?))`,
      now,
    )
    .one();
  if (row.due === null) await storage.deleteAlarm();
  else await storage.setAlarm(Math.max(now + 1000, Math.min(row.due, now + day)));
}
