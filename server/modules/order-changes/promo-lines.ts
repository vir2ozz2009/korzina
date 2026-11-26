import type { CartAdjustment } from "../../../src/shared/contracts/cart";
import type { OrderSnapshot } from "../../../src/shared/contracts/checkout";
import { type OrderLine, orderLineKey } from "../../../src/shared/contracts/order-changes";
import { addMinor, allocateMinor, multiplyMinor } from "../../../src/shared/money";

type Allocation = NonNullable<CartAdjustment["allocations"]>[number];

function retainAllocation(
  part: Allocation,
  previous: OrderLine,
  quantity: number,
  ungrouped: number,
  remaining: { value: number },
): Allocation {
  if (!part.units) {
    const kept = Math.min(quantity, ungrouped);
    const [amount] = allocateMinor(part.amount, [kept, ungrouped - kept]);
    return { ...part, amount };
  }
  const units = [];
  let gifts = 0;
  let amount = 0;
  for (const unit of part.units.toSorted((a, b) => b.paidMinor - a.paidMinor)) {
    const kept = Math.min(unit.quantity, remaining.value);
    if (!kept) break;
    remaining.value -= kept;
    units.push({ ...unit, quantity: kept });
    if (part.gifts && unit.paidMinor === 0) gifts += kept;
    amount += multiplyMinor(previous.priceMinor - unit.paidMinor, kept);
  }
  return { ...part, amount, units, gifts: gifts || undefined };
}

export function retainedPromos(snapshot: OrderSnapshot, line: OrderLine, quantity: number) {
  const parts =
    snapshot.adjustments?.flatMap(
      ({ allocations }) => allocations?.filter(({ variantId }) => variantId === line.variantId) ?? [],
    ) ?? [];
  const ungrouped =
    line.quantity - parts.flatMap(({ units }) => units ?? []).reduce((sum, unit) => sum + unit.quantity, 0);
  const remaining = { value: Math.max(0, quantity - ungrouped) };
  return new Map(parts.map((part) => [part, retainAllocation(part, line, quantity, ungrouped, remaining)]));
}

export function updateOrderPromos(
  storage: DurableObjectStorage,
  snapshot: OrderSnapshot,
  lines: OrderLine[],
  number: number,
) {
  const before = new Map(snapshot.lines.map((line) => [orderLineKey(line), line]));
  const retained = new Map<Allocation, Allocation>();
  for (const line of lines) {
    const previous = before.get(orderLineKey(line));
    if (previous?.variantId === line.variantId) {
      for (const [origin, part] of retainedPromos(snapshot, previous, line.quantity)) retained.set(origin, part);
    }
  }
  snapshot.adjustments = snapshot.adjustments?.flatMap((item) => {
    if (item.kind !== "promotion") return [item];
    const allocations = (item.allocations ?? []).flatMap((part) => {
      const kept = retained.get(part);
      return kept && (kept.amount || kept.units?.length) ? [kept] : [];
    });
    const savings = addMinor(...allocations.map(({ amount }) => amount));
    const groups = item.groups;
    const remainingGifts = allocations.reduce((sum, part) => sum + (part.gifts ?? 0), 0);
    const remainingBundles =
      groups?.type === "bundle"
        ? Math.min(
            ...(item.allocations ?? []).map((part) => {
              const originalQty = part.units?.reduce((sum, unit) => sum + unit.quantity, 0) ?? 0;
              const retainedQty = retained.get(part)?.units?.reduce((sum, unit) => sum + unit.quantity, 0) ?? 0;
              return originalQty ? Math.floor((retainedQty * groups.count) / originalQty) : 0;
            }),
          )
        : 0;
    const originalGifts = (item.allocations ?? []).reduce((sum, part) => sum + (part.gifts ?? 0), 0);
    const remainingGroups =
      groups?.type === "gift" && originalGifts
        ? Math.floor((remainingGifts * groups.count) / originalGifts)
        : Number.isFinite(remainingBundles)
          ? remainingBundles
          : 0;
    storage.sql.exec(
      "UPDATE promo_uses SET amount_minor=? WHERE order_number=? AND offer_id=?",
      savings,
      number,
      item.sourceId,
    );
    return savings
      ? [
          {
            ...item,
            amount: -savings,
            allocations,
            groups: groups && remainingGroups ? { ...groups, count: remainingGroups } : undefined,
          },
        ]
      : [];
  });
}
