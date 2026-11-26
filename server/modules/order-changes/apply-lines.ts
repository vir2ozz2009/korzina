import type { CompositionLine, OrderLine } from "../../../src/shared/contracts/order-changes";
import { orderLineKey } from "../../../src/shared/contracts/order-changes";
import { addMinor } from "../../../src/shared/money";
import { releaseOrderReservation } from "../checkout/order-reservation";
import { orderFinance } from "../checkout/order-workflow";
import { releasePromotion } from "../promo/cart";
import { updateOrderPromos } from "./promo-lines";
import type { ChangeState } from "./state";

export function applyLines(
  storage: DurableObjectStorage,
  state: ChangeState,
  changes: readonly CompositionLine[],
  reserved = new Set<string>(),
) {
  const { row, snapshot, work } = state;
  work.finance ??= orderFinance(work, snapshot, row.payment_status);
  const stock = new Set(snapshot.reservedStock ?? snapshot.lines.map(orderLineKey));
  const removed = new Set<string>();
  const updated = new Map<string, OrderLine>();
  for (const line of changes) {
    const isReduced = line.kind === "decrease";
    if (line.after) updated.set(line.id, line.after);
    else removed.add(line.id);
    if (!isReduced) stock.delete(line.id);
    if (reserved.has(line.id)) stock.add(line.id);
  }
  const lines = snapshot.lines.flatMap((line) => {
    const key = orderLineKey(line);
    if (removed.has(key)) return [];
    const update = updated.get(key);
    updated.delete(key);
    return [update ?? line];
  });
  lines.push(...updated.values());
  const retainsPacking = new Set(lines.map(orderLineKey));
  for (const line of changes) {
    if (line.kind === "replace") retainsPacking.delete(line.id);
  }
  work.packed = work.packed?.filter((id) => retainsPacking.has(id));

  if (!lines.length) {
    releaseOrderReservation(storage, snapshot, false);
    releasePromotion(storage, row.number);
    snapshot.seatReserved = false;
  }
  const grouped = snapshot.adjustments?.some(({ allocations }) => allocations?.some(({ units }) => units));
  if (grouped) updateOrderPromos(storage, snapshot, lines, row.number);
  snapshot.lines = lines;
  const promotion = snapshot.adjustments?.find((item) => item.kind === "promotion");
  if (grouped)
    snapshot.itemsBeforeDiscountMinor = addMinor(
      ...lines.map((line) => addMinor(line.totalMinor, line.promoSavingsMinor ?? 0)),
    );
  if (promotion && !grouped) {
    const savings = addMinor(...lines.map((line) => line.promoSavingsMinor ?? 0));
    snapshot.itemsBeforeDiscountMinor = addMinor(
      ...lines.map((line) => addMinor(line.totalMinor, line.promoSavingsMinor ?? 0)),
    );
    snapshot.adjustments = snapshot.adjustments?.flatMap((item) =>
      item === promotion
        ? savings > 0
          ? [
              {
                ...item,
                amount: -savings,
                allocations: lines
                  .filter((line) => line.promoSavingsMinor)
                  .map((line) => ({
                    variantId: line.variantId,
                    amount: line.promoSavingsMinor ?? 0,
                  })),
              },
            ]
          : []
        : [item],
    );
    storage.sql.exec("UPDATE promo_uses SET amount_minor=? WHERE order_number=?", savings, row.number);
  }
  snapshot.reservedStock = [...stock];
  snapshot.itemsMinor = addMinor(...lines.map(({ totalMinor }) => totalMinor));
  snapshot.totalMinor = lines.length ? addMinor(snapshot.itemsMinor, snapshot.deliveryMinor) : 0;
  const netPaid = work.finance.paidMinor - work.finance.returnedMinor;
  if (netPaid > 0 && snapshot.totalMinor > netPaid) work.finance.debtOpened = true;
  return lines.length ? row.status : "cancelled";
}
