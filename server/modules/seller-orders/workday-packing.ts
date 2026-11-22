import type { SellerPackingList, SellerPackingRow } from "../../../src/shared/contracts/workday";
import { shopDateTime } from "../../../src/shared/datetime";
import { orderListRevision } from "./list";
import { daySelection } from "./workday-selection";

type Line = {
  number: number;
  customer: string | null;
  window: string | null;
  product: string | null;
  variant: string | null;
  name: string;
  unit: string;
  quantity: number;
};

export function sellerPacking(
  storage: DurableObjectStorage,
  timeZone: string,
  now: number,
  day?: string,
): SellerPackingList {
  const { date: today, time } = shopDateTime(now, timeZone);
  day ??= today;
  const filter = daySelection(day, timeZone, "i.");
  const lines = storage.sql
    .exec<Line>(
      `SELECT i.number,i.name AS customer,json_extract(o.snapshot,'$.time.slotId') AS window,
       li.value->>'productId' AS product,li.value->>'variantId' AS variant,
       li.value->>'name' AS name,li.value->>'unit' AS unit,li.value->>'quantity' AS quantity
     FROM seller_order_index i JOIN orders o ON i.number=o.number
     LEFT JOIN json_each(o.snapshot,'$.lines') li ON i.packed<i.lines AND NOT EXISTS (
       SELECT 1 FROM json_each(o.fulfillment_state,'$.packed') p WHERE p.value=li.value->>'variantId'
     )
     WHERE i.stage<>'cancelled' AND ${filter.where}
     ORDER BY window IS NULL,window,i.number,li.key`,
      ...filter.values,
    )
    .toArray();
  const windows = new Map<string, { orders: Set<number>; rows: Map<string, SellerPackingRow> }>();
  for (const line of lines) {
    if (!line.product || !line.variant) continue;
    const id = line.window ?? "";
    const window = windows.get(id) ?? { orders: new Set<number>(), rows: new Map<string, SellerPackingRow>() };
    const key = JSON.stringify([line.product, line.variant]);
    const row = window.rows.get(key) ?? {
      productId: line.product,
      variantId: line.variant,
      name: line.name,
      variant: line.unit,
      quantity: 0,
      orders: [],
    };
    row.quantity += line.quantity;
    const previous = row.orders.at(-1);
    if (previous?.number === line.number) previous.quantity += line.quantity;
    else
      row.orders.push({
        number: line.number,
        name: line.customer,
        quantity: line.quantity,
        window: line.window ?? undefined,
      });
    window.orders.add(line.number);
    window.rows.set(key, row);
    windows.set(id, window);
  }
  return {
    rev: orderListRevision(storage),
    today,
    day,
    hasTimes: lines.some((line) => !!line.window),
    windows: [...windows.entries()].map(([id, window]) => ({
      id,
      count: window.orders.size,
      rows: [...window.rows.values()],
      passed: !!id && (day < today || (day === today && id.slice(-5) < time)),
    })),
  };
}
