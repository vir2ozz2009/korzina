import { cartTotals } from "../../../src/shared/cart-totals";
import type { Cart, CartAdjustment, CartLine } from "../../../src/shared/contracts/cart";
import { addMinor, allocateMinor, multiplyMinor } from "../../../src/shared/money";
import type { assess, Buyer, Candidate, calculatePromo } from "./calculate";
import type { BundleComponent } from "./group-catalog";
import { groupHints } from "./group-hints";

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

function priceOffer(
  offer: Candidate,
  lines: CartLine[],
  label: Parameters<typeof calculatePromo>[3],
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
      const groups = Math.min(full, (limit ?? Infinity) - count);
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
    count = Math.min(possible, limit ?? Infinity);
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

const manual = (offer: Candidate) => offer.terms.kind === "code";
const unresolved = (lines: CartLine[], consumed: Map<string, number>) =>
  lines.flatMap((line) => {
    const quantity = line.quantity - (consumed.get(line.variantId) ?? 0);
    return quantity > 0 ? [{ ...line, quantity }] : [];
  });

export function priceGroups(
  cart: Cart,
  candidates: Candidate[],
  buyer: Buyer,
  label: Parameters<typeof calculatePromo>[3],
  code: string | undefined,
  standard: typeof calculatePromo,
  assessOffer: typeof assess,
  components?: ReadonlyMap<string, BundleComponent>,
): Cart {
  const standardOffers = candidates.filter(({ terms }) => !terms.group);
  const groups = candidates.filter(({ terms }) => terms.group);
  const source = cart.lines
    .filter((line) => line.available && line.quantity > 0)
    .map((line) => ({ ...line, quantity: Math.min(line.quantity, line.stock ?? line.quantity) }))
    .filter((line) => line.quantity > 0);
  const initial = standard(cart, standardOffers, buyer, label, code);
  const active = groups
    .filter((offer) => !manual(offer) || offer.terms.code === code)
    .filter((offer) => !assessOffer(offer, source, buyer).reason)
    .sort((a, b) => Number(manual(a)) - Number(manual(b)) || a.id.localeCompare(b.id));
  let best = { total: initial.totalMinor, adjustments: initial.adjustments };
  const signatures = new Map<string, number>();
  function search(lines: CartLine[], offers: Candidate[], applied: CartAdjustment[], savings: number) {
    const signature = JSON.stringify([
      offers.map(({ id }) => id),
      lines.map(({ variantId, quantity }) => [variantId, quantity]),
    ]);
    if ((signatures.get(signature) ?? -1) >= savings) return;
    signatures.set(signature, savings);
    const legacy =
      applied.length && standardOffers.length
        ? standard({ ...cart, lines }, standardOffers, buyer, label, code)
        : undefined;
    if (applied.length) {
      const adjustments = [...applied, ...(legacy?.adjustments ?? [])];
      const total = (initial.itemsMinor ?? 0) + adjustments.reduce((sum, { amount }) => sum + amount, 0);
      if (
        total < best.total ||
        (total === best.total && best.adjustments.some((item) => item.code) && !adjustments.some((item) => item.code))
      )
        best = { total, adjustments };
    }
    const choices = offers
      .flatMap((offer) => {
        const assessment = assessOffer(offer, lines, buyer);
        if (!assessment.lines) return [];
        const priced = priceOffer(offer, assessment.lines, label);
        return priced ? [{ offer, priced }] : [];
      })
      .sort((a, b) => a.priced.adjustment.amount - b.priced.adjustment.amount);
    const subtotal = initial.itemsMinor ?? 0;
    const upper =
      savings -
      choices.reduce((sum, choice) => sum + choice.priced.adjustment.amount, 0) -
      (legacy ?? initial).adjustments.reduce((sum, adjustment) => sum + adjustment.amount, 0);
    if (
      subtotal - upper > best.total ||
      (subtotal - upper === best.total && !best.adjustments.some((item) => item.code))
    )
      return;
    for (const { offer, priced } of choices) {
      search(
        unresolved(lines, priced.consumed),
        offers.filter((other) => other !== offer),
        [...applied, priced.adjustment],
        savings - priced.adjustment.amount,
      );
    }
  }
  if (active.length) search(source, active, [], 0);

  const promo = { ...initial.promo };
  const entered = code && groups.find((offer) => manual(offer) && offer.terms.code === code);
  if (entered) {
    const assessment = assessOffer(entered, source, buyer);
    promo.reason = best.adjustments.some((item) => item.sourceId === entered.id)
      ? "applied"
      : (assessment.reason ??
        (assessment.lines && priceOffer(entered, assessment.lines, label) ? "better_automatic" : "quantity"));
  } else if (code && best.adjustments.some((item) => item.code === code)) {
    promo.reason = "applied";
  } else if (promo.reason === "applied") {
    promo.reason = "better_automatic";
  }
  const hints = groupHints(
    groups,
    source,
    best.adjustments,
    label,
    code,
    components,
    (lines, excludedId) =>
      priceGroups(
        { ...cart, ...cartTotals(lines) },
        candidates.filter(({ id }) => id !== excludedId),
        buyer,
        label,
        code,
        standard,
        assessOffer,
      ).totalMinor,
  );
  if (hints.length) promo.groupHints = hints;
  const totals = cartTotals(cart.lines, best.adjustments);
  const savings = new Map<string, number>();
  for (const { allocations } of best.adjustments) {
    for (const { variantId, amount } of allocations ?? [])
      savings.set(variantId, (savings.get(variantId) ?? 0) + amount);
  }
  return {
    ...initial,
    ...totals,
    promo,
    lines: totals.lines.map((line) => ({ ...line, totalMinor: line.totalMinor - (savings.get(line.variantId) ?? 0) })),
  };
}
