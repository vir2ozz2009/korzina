import { shopDateTime } from "../../../src/shared/datetime";

export const uncategorizedId = "__uncategorized__";
export function pauseUntil(duration: "tomorrow" | "manual", now: number, timeZone: string) {
  if (duration === "manual") return 0;
  const { date } = shopDateTime(now, timeZone);
  let sameDay = now;
  let nextDay = now + 36 * 3_600_000;
  while (nextDay - sameDay > 1) {
    const middle = Math.floor((sameDay + nextDay) / 2);
    if (shopDateTime(middle, timeZone).date === date) sameDay = middle;
    else nextDay = middle;
  }
  return nextDay;
}

export function nextSaleDeadline(storage: DurableObjectStorage) {
  const { deadline } = storage.sql
    .exec<{ deadline: number | null }>(
      `SELECT MIN(deadline) AS deadline FROM (
        SELECT MIN(sale_pause) AS deadline FROM products WHERE sale_pause>0
        UNION ALL SELECT MIN(sale_pause) FROM variants WHERE sale_pause>0)`,
    )
    .one();
  return deadline;
}

export function expireSalePauses(storage: DurableObjectStorage, now: number) {
  storage.transactionSync(() => {
    storage.sql.exec("UPDATE products SET sale_pause=NULL WHERE sale_pause>0 AND sale_pause<=?", now);
    storage.sql.exec("UPDATE variants SET sale_pause=NULL WHERE sale_pause>0 AND sale_pause<=?", now);
  });
  return nextSaleDeadline(storage);
}
