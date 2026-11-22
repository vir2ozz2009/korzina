import {
  type SellerOrderCalendar,
  type SellerWorkday,
  workdayActions,
  workdayStages,
} from "../../../src/shared/contracts/workday";
import { calendarDate, shopDateTime, shopDayStart } from "../../../src/shared/datetime";
import { orderListRevision } from "./list";
import { daySelection, focusSelection, localTimestamp } from "./workday-selection";

type Context = { storage: DurableObjectStorage; timeZone: string; now: number };

export function sellerWorkday({ storage, timeZone, now }: Context, money: boolean, previous?: string) {
  const day = shopDateTime(now, timeZone).date;
  const cutoff = localTimestamp(now, timeZone);
  const version = (rev: number) => JSON.stringify([rev, timeZone, cutoff, money]);
  if (previous) {
    const current = version(orderListRevision(storage));
    if (previous === current) return { unchanged: true as const, version: current };
  }
  const scope = daySelection(day, timeZone);
  const actions = workdayActions.filter((action) => money || (action !== "receipt" && action !== "payment"));
  const actionFilters = actions.map((action) => focusSelection(action, cutoff));
  const row = storage.sql
    .exec<Record<string, number | string | null>>(
      `WITH orders_today AS (
       SELECT *,(${scope.where}) AS today FROM seller_order_index
     ), upcoming AS (
       SELECT json_extract(o.snapshot,'$.time.slotId') AS window,COUNT(*) AS count
       FROM orders_today i JOIN orders o ON o.number=i.number
       WHERE today AND i.stage<>'cancelled' AND i.packed<i.lines AND window IS NOT NULL
         AND substr(i.receiving_at,1,11)||substr(window,-5)>=?
       GROUP BY window ORDER BY window LIMIT 1
     )
     SELECT (SELECT CAST(value AS INTEGER) FROM settings WHERE key='seller_orders_revision') AS rev,
       COUNT(*) FILTER(WHERE today) AS count,
       ${money ? "SUM(total_minor) FILTER(WHERE today AND stage<>'cancelled') AS totalMinor, SUM(debt_minor) AS debtMinor, COALESCE((SELECT currency FROM catalog_state WHERE id=1),MAX(currency)) AS currency," : ""}
       ${workdayStages.map((stage) => `COUNT(*) FILTER(WHERE today AND stage='${stage}') AS ${stage}`).join(",")},
       ${actions.map((action, index) => `COUNT(*) FILTER(WHERE ${action === "accept" ? "today AND " : ""}(${actionFilters[index].where})) AS ${action}`).join(",")},
       (SELECT window FROM upcoming) AS nextWindow,(SELECT count FROM upcoming) AS nextCount
     FROM orders_today`,
      ...scope.values,
      cutoff,
      ...actionFilters.flatMap((filter) => filter.values),
    )
    .one();

  const rev = Number(row.rev);
  return {
    rev,
    version: version(rev),
    day,
    timeZone,
    count: Number(row.count),
    stages: {
      placed: Number(row.placed),
      accepted: Number(row.accepted),
      ready: Number(row.ready),
      handed: Number(row.handed),
    },
    actions: Object.fromEntries(actions.map((action) => [action, Number(row[action])])),
    ...(money && {
      totalMinor: Number(row.totalMinor),
      currency: String(row.currency ?? ""),
      debtMinor: Number(row.debtMinor),
    }),
    ...(typeof row.nextWindow === "string" && { upcoming: { window: row.nextWindow, count: Number(row.nextCount) } }),
  } satisfies SellerWorkday;
}

export function sellerOrderCalendar({ storage, timeZone, now }: Context, month?: string, previous?: string) {
  const today = shopDateTime(now, timeZone).date;
  month ??= today.slice(0, 7);
  const rev = orderListRevision(storage);
  const version = JSON.stringify([rev, month, today, timeZone]);
  if (previous === version) return { unchanged: true as const };
  const first = `${month}-01`;
  const days = [];
  for (let day = first; day.startsWith(month); day = calendarDate(day, 1)) {
    const next = calendarDate(day, 1);
    days.push([day, next, shopDayStart(day, timeZone), shopDayStart(next, timeZone)]);
  }
  const counts = storage.sql
    .exec<{ day: string; count: number }>(
      `SELECT d.value->>0 AS day,COUNT(i.number) AS count FROM json_each(?) d
     LEFT JOIN seller_order_index i
       ON ((i.receiving_at>=d.value->>0 AND i.receiving_at<d.value->>1)
          OR (i.receiving_at='' AND i.created_at>=d.value->>2 AND i.created_at<d.value->>3))
     GROUP BY d.key`,
      JSON.stringify(days),
    )
    .toArray();
  return {
    rev,
    version,
    month,
    today,
    counts: Object.fromEntries(counts.map((row) => [row.day, row.count])),
  } satisfies SellerOrderCalendar;
}
