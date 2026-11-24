import { z } from "zod";
import type { SalesRefund } from "../../../src/shared/contracts/seller-order";
import { shopDateTime, shopDayStart } from "../../../src/shared/datetime";
import { orderRevenue } from "./revenue";

type Source = {
  number: number;
  createdAt: number;
  completedAt: number | null;
  snapshot: string;
  workflow: string;
};
type Contribution = {
  day: string | null;
  hour: number | null;
  currency: string;
  revenueMinor: number | null;
  incomplete: number;
};
const sourceSql = `SELECT o.number, o.created_at AS createdAt, o.snapshot, o.fulfillment_state AS workflow,
  (SELECT e.created_at FROM buyer_order_events e WHERE e.order_number=o.number
    AND e.event IN ('order.complete','order.markPickedUp') ORDER BY e.id DESC LIMIT 1) AS completedAt
  FROM orders o WHERE o.status='completed'`;
const zoneKey = "sales_projection_zone";
const hourMs = 3_600_000;
const amount = z.int().nonnegative();
const snapshotSchema = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/u),
  itemsMinor: amount,
  deliveryMinor: amount,
  fulfillment: z
    .union([
      z.object({ mode: z.literal("pickup") }),
      z.object({ mode: z.literal("delivery"), payee: z.enum(["shop", "courier"]) }),
    ])
    .optional(),
  lines: z.array(
    z.object({
      productId: z.string(),
      variantId: z.string(),
      name: z.string(),
      unit: z.string(),
      quantity: amount,
      priceMinor: amount,
      totalMinor: amount,
    }),
  ),
});

function apply(storage: DurableObjectStorage, row: Contribution, direction: 1 | -1) {
  if (row.day === null || row.hour === null) return;
  for (const hour of [-1, row.hour]) {
    storage.sql.exec(
      `INSERT INTO sales_totals VALUES(?,?,?,?,?,?,?)
       ON CONFLICT(currency,day,hour) DO UPDATE SET
         revenue_minor=revenue_minor+excluded.revenue_minor, order_count=order_count+excluded.order_count,
         positive_orders=positive_orders+excluded.positive_orders, unknown_orders=unknown_orders+excluded.unknown_orders`,
      row.currency,
      row.day,
      hour,
      (row.revenueMinor ?? 0) * direction,
      direction,
      Number((row.revenueMinor ?? 0) > 0) * direction,
      row.incomplete * direction,
    );
    if (direction < 0)
      storage.sql.exec(
        "DELETE FROM sales_totals WHERE currency=? AND day=? AND hour=? AND order_count=0",
        row.currency,
        row.day,
        hour,
      );
  }
}

function project(storage: DurableObjectStorage, source: Source, timeZone: string, currency: string) {
  const attempt = snapshotSchema.safeParse(JSON.parse(source.snapshot));
  const snapshot = attempt.data;
  const saved = JSON.parse(source.workflow) as { finance?: { salesRefund?: SalesRefund } };
  const date = source.completedAt === null ? null : shopDateTime(source.completedAt, timeZone).date;
  const hour =
    date === null || source.completedAt === null
      ? null
      : Math.floor((source.completedAt - shopDayStart(date, timeZone)) / hourMs);
  const sale = snapshot && orderRevenue(snapshot, saved.finance?.salesRefund);
  const orderCurrency = snapshot?.currency ?? currency;
  const incomplete = Number(!sale || (!snapshot?.fulfillment && !!snapshot?.deliveryMinor));
  storage.sql.exec(
    "INSERT INTO sales_orders VALUES(?,?,?,?,?,?,?,?)",
    source.number,
    source.completedAt,
    source.createdAt,
    date,
    hour,
    orderCurrency,
    sale?.revenueMinor ?? null,
    incomplete,
  );
  if (date && sale) {
    for (const [position, line] of sale.lines.entries())
      storage.sql.exec(
        "INSERT INTO sales_lines VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        source.number,
        line.productId,
        line.variantId,
        position,
        date,
        orderCurrency,
        line.name,
        line.unit,
        line.quantity,
        line.revenueMinor,
        0,
      );
  }
  apply(storage, { day: date, hour, currency: orderCurrency, revenueMinor: sale?.revenueMinor ?? null, incomplete }, 1);
}

function projectedZone(storage: DurableObjectStorage) {
  return storage.sql.exec<{ value: string }>("SELECT value FROM settings WHERE key=?", zoneKey).toArray()[0]?.value;
}

export function ensureSalesProjection(storage: DurableObjectStorage, timeZone: string, currency: string) {
  if (projectedZone(storage) === timeZone) return;
  storage.transactionSync(() => {
    storage.sql.exec("DELETE FROM sales_orders");
    storage.sql.exec("DELETE FROM sales_totals");
    for (const row of storage.sql.exec<Source>(sourceSql).toArray()) project(storage, row, timeZone, currency);
    storage.sql.exec("INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)", zoneKey, timeZone);
    advanceRevision(storage);
  });
}

/** Called inside the order command transaction, after the transition event is written. */
export function refreshOrderSales(storage: DurableObjectStorage, number: number, currency: string) {
  const timeZone = projectedZone(storage);
  if (!timeZone) return;
  const previous = storage.sql
    .exec<Contribution>(
      "SELECT day,hour,currency,revenue_minor AS revenueMinor,incomplete FROM sales_orders WHERE number=?",
      number,
    )
    .toArray()[0];
  if (previous) {
    apply(storage, previous, -1);
    storage.sql.exec("DELETE FROM sales_orders WHERE number=?", number);
  }
  const current = storage.sql.exec<Source>(`${sourceSql} AND o.number=?`, number).toArray()[0];
  if (current) project(storage, current, timeZone, currency);
  if (current || previous) advanceRevision(storage);
}

function advanceRevision(storage: DurableObjectStorage) {
  storage.sql.exec(`INSERT INTO settings(key,value) VALUES('sales_revision','1')
    ON CONFLICT(key) DO UPDATE SET value=CAST(value AS INTEGER)+1`);
}
