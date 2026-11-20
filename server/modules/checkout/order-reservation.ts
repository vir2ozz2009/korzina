import type { OrderSnapshot } from "../../../src/shared/contracts/checkout";

export type ReservedOrder = OrderSnapshot & { seatReserved?: boolean; reservedStock?: string[] };

export function releaseOrderReservation(storage: DurableObjectStorage, order: ReservedOrder, returnStock: boolean) {
  if (returnStock) {
    const reserved = order.reservedStock && new Set(order.reservedStock);
    const lines = order.lines
      .filter(({ variantId }) => !reserved || reserved.has(variantId))
      .map(({ variantId, quantity }) => ({ variantId, quantity }));
    storage.sql.exec(
      `WITH returned AS (
        SELECT json_extract(value,'$.variantId') AS id, json_extract(value,'$.quantity') AS quantity FROM json_each(?)
       ) UPDATE variants SET stock=stock+returned.quantity FROM returned WHERE variants.id=returned.id AND stock IS NOT NULL`,
      JSON.stringify(lines),
    );
  }
  if (order.time && order.seatReserved !== false)
    storage.sql.exec(
      "UPDATE receiving_seats SET booked=booked-1 WHERE method=? AND date=? AND slot=? AND booked>0",
      order.receiving.mode,
      order.time.date,
      order.time.slotId ?? "",
    );
}
