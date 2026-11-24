import type { SalesPeriod, SalesReport, SalesTotals } from "../../../src/shared/contracts/seller-sales";
import { calendarDate, shopDateTime, shopDayStart } from "../../../src/shared/datetime";

const dayMs = 86_400_000;
const hourMs = 3_600_000;
const midnight = (date: string) => Date.parse(`${date}T00:00:00Z`);
const days = ({ from, to }: SalesPeriod) => (midnight(to) - midnight(from)) / dayMs + 1;

export function completedWeek(now: number, timeZone: string): SalesPeriod {
  const { date } = shopDateTime(now, timeZone);
  return { from: calendarDate(date, -7), to: calendarDate(date, -1) };
}

type Row = {
  day: string;
  hour: number;
  revenueMinor: number;
  orderCount: number;
  positiveOrders: number;
  unknown: number;
};

function summarize(rows: Row[], missing = false): SalesTotals {
  const total = rows.reduce(
    (sum, row) => ({
      revenueMinor: sum.revenueMinor + row.revenueMinor,
      orderCount: sum.orderCount + row.orderCount,
      positiveOrders: sum.positiveOrders + row.positiveOrders,
      unknown: sum.unknown + row.unknown,
    }),
    { revenueMinor: 0, orderCount: 0, positiveOrders: 0, unknown: 0 },
  );
  const incomplete = missing || total.unknown > 0;
  return {
    revenueMinor: incomplete && !total.revenueMinor && total.orderCount === total.unknown ? null : total.revenueMinor,
    orderCount: total.orderCount,
    positiveOrders: total.positiveOrders,
    averageMinor: total.positiveOrders ? total.revenueMinor / total.positiveOrders : null,
    incomplete,
  };
}

function aggregateRows(storage: DurableObjectStorage, currency: string, period: SalesPeriod, hourly = false) {
  return storage.sql
    .exec<Row>(
      `SELECT day,hour,revenue_minor AS revenueMinor,order_count AS orderCount,
      positive_orders AS positiveOrders,unknown_orders AS unknown
      FROM sales_totals WHERE currency=? AND day BETWEEN ? AND ? AND hour ${hourly ? ">=0" : "=-1"} ORDER BY day,hour`,
      currency,
      period.from,
      period.to,
    )
    .toArray();
}

export function missingCompletion(
  storage: DurableObjectStorage,
  timeZone: string,
  currency: string,
  period: SalesPeriod,
) {
  return (
    storage.sql
      .exec(
        "SELECT 1 FROM sales_orders WHERE currency=? AND day IS NULL AND created_at<? LIMIT 1",
        currency,
        shopDayStart(calendarDate(period.to, 1), timeZone),
      )
      .toArray().length > 0
  );
}

export function weeklyRevenue(storage: DurableObjectStorage, timeZone: string, currency: string, now: number) {
  const period = completedWeek(now, timeZone);
  const { revenueMinor, incomplete } = summarize(
    aggregateRows(storage, currency, period),
    missingCompletion(storage, timeZone, currency, period),
  );
  return { period, currency, revenueMinor, incomplete };
}

function nextInterval(date: string, unit: SalesReport["unit"]) {
  if (unit === "week") return calendarDate(date, 7 - ((new Date(midnight(date)).getUTCDay() + 6) % 7));
  if (unit === "month") {
    const next = new Date(midnight(date));
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + 1);
    return next.toISOString().slice(0, 10);
  }
  return calendarDate(date, 1);
}

function rangePoints(rows: Row[], period: SalesPeriod, unit: SalesReport["unit"], timeZone: string, missing: boolean) {
  if (unit === "hour") {
    const start = shopDayStart(period.from, timeZone);
    const end = shopDayStart(calendarDate(period.from, 1), timeZone);
    const byHour = new Map(rows.map((entry) => [entry.hour, entry]));
    return Array.from({ length: Math.ceil((end - start) / hourMs) }, (_, hour) => {
      const row = byHour.get(hour);
      const instant = start + hour * hourMs;
      return {
        from: new Date(instant).toISOString(),
        to: new Date(Math.min(instant + hourMs, end)).toISOString(),
        ...summarize(row ? [row] : [], missing),
      };
    });
  }
  let index = 0;
  const points = [];
  for (let from = period.from; from <= period.to; from = nextInterval(from, unit)) {
    const to = [calendarDate(nextInterval(from, unit), -1), period.to].sort()[0];
    const slice: Row[] = [];
    while (index < rows.length && rows[index].day <= to) slice.push(rows[index++]);
    points.push({ from, to, ...summarize(slice, missing) });
  }
  return points;
}

function percent(value: number | null, previous: number | null) {
  return value === null || !previous ? null : Math.round(((value - previous) / previous) * 100);
}

function compareTotals(current: SalesTotals, previous?: SalesTotals) {
  if (!previous || current.incomplete || previous.incomplete) return null;
  return {
    revenueMinor: percent(current.revenueMinor, previous.revenueMinor),
    orderCount: percent(current.orderCount, previous.orderCount),
    average: percent(current.averageMinor, previous.averageMinor),
  };
}

export function sellerSalesReport(
  storage: DurableObjectStorage,
  timeZone: string,
  currency: string,
  period: SalesPeriod,
  compare: boolean,
): SalesReport {
  const length = days(period);
  const unit = length === 1 ? "hour" : length <= 31 ? "day" : length <= 180 ? "week" : "month";
  const previousPeriod = { from: calendarDate(period.from, -length), to: calendarDate(period.from, -1) };
  const current = readPeriod(storage, timeZone, currency, period, unit);
  const previous = compare ? readPeriod(storage, timeZone, currency, previousPeriod, unit) : null;
  return {
    period,
    timeZone,
    currency,
    unit,
    current: current.totals,
    points: current.points,
    previous: previous?.totals ?? null,
    changes: compareTotals(current.totals, previous?.totals),
    revenueDifference:
      previous && current.totals.revenueMinor !== null && previous.totals.revenueMinor !== null
        ? current.totals.revenueMinor - previous.totals.revenueMinor
        : null,
    previousPoints: previous?.points ?? [],
  };
}

function readPeriod(
  storage: DurableObjectStorage,
  timeZone: string,
  currency: string,
  period: SalesPeriod,
  unit: SalesReport["unit"],
) {
  const rows = aggregateRows(storage, currency, period, unit === "hour");
  const missing = missingCompletion(storage, timeZone, currency, period);
  return { totals: summarize(rows, missing), points: rangePoints(rows, period, unit, timeZone, missing) };
}

export function sellerSalesDays(
  storage: DurableObjectStorage,
  timeZone: string,
  currency: string,
  period: SalesPeriod,
) {
  return readPeriod(storage, timeZone, currency, period, "day").points;
}
