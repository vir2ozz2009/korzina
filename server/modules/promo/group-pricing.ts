import { cartTotals } from "../../../src/shared/cart-totals";
import type { Cart, CartAdjustment, CartLine } from "../../../src/shared/contracts/cart";
import type { assess, Buyer, Candidate, calculatePromo } from "./calculate";
import type { BundleComponent } from "./group-catalog";
import { groupHints } from "./group-hints";
import { priceOffer, priceOptions } from "./group-offer";
import { inScope } from "./group-terms";

const manual = (offer: Candidate) => offer.terms.kind === "code";
const unresolved = (lines: CartLine[], consumed: Map<string, number>) =>
  lines.flatMap((line) => {
    const quantity = line.quantity - (consumed.get(line.variantId) ?? 0);
    return quantity > 0 ? [{ ...line, quantity }] : [];
  });

function resolveGroups(
  cart: Cart,
  standardOffers: Candidate[],
  groups: Candidate[],
  buyer: Buyer,
  label: Parameters<typeof calculatePromo>[3],
  code: string | undefined,
  standard: typeof calculatePromo,
  assessOffer: typeof assess,
) {
  const source = cart.lines
    .filter((line) => line.available && line.quantity > 0)
    .map((line) => ({ ...line, quantity: Math.min(line.quantity, line.stock ?? line.quantity) }))
    .filter((line) => line.quantity > 0)
    .sort((a, b) => a.variantId.localeCompare(b.variantId));
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
      applied.some((item) => item.code),
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
    // Each unit can receive at most the largest per-unit saving of any remaining group.
    // This fractional relaxation is an upper bound, never an approximate checkout price.
    const unitSavings = new Map<string, number>();
    for (const { offer, priced } of choices) {
      const group = offer.terms.group;
      for (const line of lines) {
        const allocation = priced.adjustment.allocations?.find((item) => item.variantId === line.variantId);
        const saving =
          group?.type === "gift" && inScope(offer.terms, line)
            ? (line.priceMinor * group.gift) / (group.buy + group.gift)
            : (allocation?.amount ?? 0) / (priced.consumed.get(line.variantId) || 1);
        unitSavings.set(line.variantId, Math.max(unitSavings.get(line.variantId) ?? 0, saving));
      }
    }
    const groupUpper = Math.min(
      -choices.reduce((sum, choice) => sum + choice.priced.adjustment.amount, 0),
      lines.reduce((sum, line) => sum + Math.ceil(line.quantity * (unitSavings.get(line.variantId) ?? 0)), 0),
    );
    const upper =
      savings + groupUpper - (legacy ?? initial).adjustments.reduce((sum, adjustment) => sum + adjustment.amount, 0);
    if (
      subtotal - upper > best.total ||
      (subtotal - upper === best.total && !best.adjustments.some((item) => item.code))
    )
      return;
    for (const { offer } of choices) {
      const assessment = assessOffer(offer, lines, buyer);
      for (const priced of priceOptions(offer, assessment.lines ?? [], label)) {
        if (subtotal - upper === best.total && !best.adjustments.some((item) => item.code)) return;
        search(
          unresolved(lines, priced.consumed),
          offers.filter((other) => other !== offer),
          [...applied, priced.adjustment],
          savings - priced.adjustment.amount,
        );
      }
    }
  }
  if (active.length) search(source, active, [], 0);
  return { source, initial, best };
}

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
  // One cache for the real basket, distinct top-ups and identical bundle hint comparisons.
  const resolved = new Map<string, ReturnType<typeof resolveGroups>>();
  const resolve = (lines: CartLine[], availableGroups = groups) => {
    const key = JSON.stringify([lines, availableGroups.map(({ id }) => id)]);
    let result = resolved.get(key);
    if (!result) {
      result = resolveGroups(
        { ...cart, lines },
        standardOffers,
        availableGroups,
        buyer,
        label,
        code,
        standard,
        assessOffer,
      );
      resolved.set(key, result);
    }
    return result;
  };
  const { source, initial, best } = resolve(cart.lines);
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
  // Price each distinct top-up once, without generating more hints or reading the catalog again.
  const topUps = new Map<string, Map<number, CartAdjustment[]>>();
  const hints = groupHints(
    groups,
    source,
    best.adjustments,
    label,
    code,
    components,
    (lines, excludedId) =>
      resolve(
        lines,
        groups.filter(({ id }) => id !== excludedId),
      ).best.total,
    (variantId, quantity) => {
      const byQuantity = topUps.get(variantId) ?? new Map<number, CartAdjustment[]>();
      topUps.set(variantId, byQuantity);
      const cached = byQuantity.get(quantity);
      if (cached) return cached;
      const { best } = resolve(cart.lines.map((line) => (line.variantId === variantId ? { ...line, quantity } : line)));
      byQuantity.set(quantity, best.adjustments);
      return best.adjustments;
    },
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
