import type { CartAdjustment, CartLine } from "../../../src/shared/contracts/cart";
import { addMinor, allocateMinor, multiplyMinor } from "../../../src/shared/money";
import type { Candidate, calculatePromo } from "./calculate";

type Allocation = NonNullable<CartAdjustment["allocations"]>[number];
type PricedGroup = { adjustment: CartAdjustment; consumed: Map<string, number> };

function unitPrices(quantity: number, amount: number) {
  const low = Math.floor(amount / quantity);
  const high = amount % quantity;
  return [
    ...(quantity > high ? [{ quantity: quantity - high, paidMinor: low }] : []),
    ...(high ? [{ quantity: high, paidMinor: low + 1 }] : []),
  ];
}

export function priceOffer(
  offer: Candidate,
  lines: CartLine[],
  label: Parameters<typeof calculatePromo>[3],
  counts?: ReadonlyMap<string, number>,
  maximum = Infinity,
): PricedGroup | undefined {
  const { terms } = offer;
  const { group } = terms;
  if (!group) return;
  const consumed = new Map<string, number>();
  let allocations: Allocation[];
  let count = 0;
  let possible = 0;
  let limit: number | undefined;
  if (group.type === "gift") {
    const size = group.buy + group.gift;
    limit = group.limit;
    allocations = [];
    for (const line of lines.toSorted(
      (a, b) => b.priceMinor - a.priceMinor || a.variantId.localeCompare(b.variantId),
    )) {
      const full = Math.floor(line.quantity / size);
      possible += full;
      const groups = Math.min(counts?.get(line.variantId) ?? full, (limit ?? Infinity) - count);
      if (!groups || !line.priceMinor) continue;
      count += groups;
      const gifts = groups * group.gift;
      consumed.set(line.variantId, groups * size);
      allocations.push({
        variantId: line.variantId,
        amount: multiplyMinor(line.priceMinor, gifts),
        gifts,
        units: [
          { quantity: gifts, paidMinor: 0 },
          { quantity: groups * group.buy, paidMinor: line.priceMinor },
        ],
      });
    }
  } else {
    limit = group.limit === null ? undefined : (group.limit ?? 1);
    const components = group.components.toSorted((a, b) => a.variantId.localeCompare(b.variantId));
    const byId = new Map(lines.map((line) => [line.variantId, line]));
    possible = components.length
      ? Math.min(
          ...components.map(({ quantity, variantId }) => Math.floor((byId.get(variantId)?.quantity ?? 0) / quantity)),
        )
      : 0;
    count = Math.min(possible, limit ?? Infinity, maximum);
    if (!count) return;
    const weights = components.map(({ variantId, quantity }) =>
      multiplyMinor(byId.get(variantId)?.priceMinor ?? 0, quantity),
    );
    if (addMinor(...weights) <= group.priceMinor) return;
    const shares = allocateMinor(group.priceMinor, weights);
    allocations = components.map(({ variantId, quantity }, index) => {
      consumed.set(variantId, quantity * count);
      return {
        variantId,
        amount: multiplyMinor(weights[index] - shares[index], count),
        units: unitPrices(quantity, shares[index]).map((unit) => ({ ...unit, quantity: unit.quantity * count })),
      };
    });
  }
  if (!count) return;
  return {
    consumed,
    adjustment: {
      kind: "promotion",
      sourceId: offer.id,
      sourceRevision: offer.revision,
      label: label(terms),
      amount: -addMinor(...allocations.map(({ amount }) => amount)),
      code: terms.code,
      allocations,
      groups: { type: group.type, count, possible, limit },
    },
  };
}

// Enumerate every feasible consumption, including partial bundles and gifts on cheaper SKUs.
// Zero is represented by leaving this offer unused in the search.
export function* priceOptions(offer: Candidate, lines: CartLine[], label: Parameters<typeof calculatePromo>[3]) {
  const maximum = priceOffer(offer, lines, label);
  if (!maximum) return;
  yield maximum;
  const group = offer.terms.group;
  if (group?.type === "bundle") {
    for (let count = (maximum.adjustment.groups?.count ?? 0) - 1; count > 0; count--) {
      const priced = priceOffer(offer, lines, label, undefined, count);
      if (priced) yield priced;
    }
  } else if (group?.type === "gift") {
    const size = group.buy + group.gift;
    const maximumSignature = JSON.stringify([...maximum.consumed].sort());
    const counts = new Map<string, number>();
    const eligible = lines.filter((line) => line.priceMinor && line.quantity >= size);
    function* distribute(index: number, remaining: number): Generator<PricedGroup> {
      if (index === eligible.length) {
        const priced = priceOffer(offer, lines, label, counts);
        if (priced && JSON.stringify([...priced.consumed].sort()) !== maximumSignature) yield priced;
        return;
      }
      const line = eligible[index];
      const full = Math.min(Math.floor(line.quantity / size), remaining);
      for (let count = full; count >= 0; count--) {
        counts.set(line.variantId, count);
        yield* distribute(index + 1, remaining - count);
      }
    }
    yield* distribute(0, group.limit ?? Infinity);
  }
}
