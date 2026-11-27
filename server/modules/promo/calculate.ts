import { cartTotals } from "../../../src/shared/cart-totals";
import type { Cart, CartAdjustment, CartLine } from "../../../src/shared/contracts/cart";
import type { PromoReason, PromoStatus, PromoTerms } from "../../../src/shared/contracts/promo";
import {
  addMinor,
  allocateMinor,
  currencyDigits,
  multiplyMinor,
  percentageMinor,
  roundMinor,
} from "../../../src/shared/money";

import type { BundleComponent } from "./group-catalog";
import { priceGroups } from "./group-pricing";
import { inScope } from "./group-terms";

export type Candidate = {
  id: string;
  revision: number;
  terms: PromoTerms;
  status: PromoStatus;
  used: number;
  personalUsed: number;
};
export type Buyer = { confirmed: boolean; completed: number; exactUsed: boolean };

function discountAmount(terms: PromoTerms, base: number, currency: string) {
  const unit = 10 ** currencyDigits(currency);
  const discount = terms.discount;
  return Math.min(
    base,
    discount.type === "percent"
      ? Math.min(discount.capMinor ?? base, percentageMinor(base, discount.value, unit, "ceil"))
      : roundMinor(discount.value, unit, "ceil"),
  );
}

export function promoLabel(terms: PromoTerms, money: (amount: number) => string) {
  if (terms.group?.type === "gift") return `${terms.group.buy + terms.group.gift} по цене ${terms.group.buy}`;
  if (terms.group?.type === "bundle") return terms.name;
  if (terms.kind === "code") return `По промокоду ${terms.code}`;
  const purchase = terms.purchase;
  const label =
    purchase?.mode === "exact"
      ? purchase.number === 1
        ? "Первый заказ"
        : `Заказ №${purchase.number}`
      : purchase
        ? `С заказа №${purchase.number}`
        : terms.name;
  const discount = terms.discount;
  return discount.type === "fixed"
    ? `${label} · ${money(discount.value)}`
    : `${label} · ${discount.value / 100}%${discount.capMinor ? `, до ${money(discount.capMinor)}` : ""}`;
}

export function assess(candidate: Candidate, lines: CartLine[], buyer: Buyer) {
  const { terms, status, used, personalUsed } = candidate;
  if (status !== "active")
    return { reason: status === "ended" ? "expired" : status === "scheduled" ? "scheduled" : "disabled" } as const;
  if (terms.totalLimit && used >= terms.totalLimit) return { reason: "limit" } as const;
  const scoped = lines.filter((line) => inScope(terms, line));
  const eligibleLines = scoped.filter((line) => terms.group || terms.kind !== "code" || !line.oldPriceMinor);
  if (!eligibleLines.length) return { reason: scoped.length ? "regular_price" : "scope" } as const;
  if (!buyer.confirmed && (terms.confirmed || terms.purchase || terms.personalLimit))
    return { reason: "telegram" } as const;
  if (terms.personalLimit && personalUsed >= terms.personalLimit) return { reason: "personal_limit" } as const;
  if (terms.purchase) {
    if (buyer.completed + 1 < terms.purchase.number) return { reason: "purchase_early" } as const;
    if (terms.purchase.mode === "exact") {
      if (buyer.completed + 1 > terms.purchase.number) return { reason: "purchase_passed" } as const;
      if (buyer.exactUsed) return { reason: "purchase_used" } as const;
    }
  }
  const base = addMinor(...eligibleLines.map((line) => multiplyMinor(line.priceMinor, line.quantity)));
  const quantity = eligibleLines.reduce((sum, line) => sum + line.quantity, 0);
  if (quantity < (terms.minimumQuantity ?? 0))
    return { reason: "quantity", missingQuantity: (terms.minimumQuantity ?? 0) - quantity } as const;
  if (base < (terms.minimumMinor ?? 0))
    return { reason: "minimum", missingMinor: (terms.minimumMinor ?? 0) - base } as const;
  return { base, lines: eligibleLines } as const;
}

export function calculatePromo(
  cart: Cart,
  candidates: Candidate[],
  buyer: Buyer,
  label: (terms: PromoTerms) => string,
  code?: string,
  components?: ReadonlyMap<string, BundleComponent>,
): Cart {
  if (!cart.currency || !candidates.some(({ terms }) => terms.group))
    return calculateStandard(cart, candidates, buyer, label, code);
  return priceGroups(cart, candidates, buyer, label, code, calculateStandard, assess, components);
}

function calculateStandard(
  cart: Cart,
  candidates: Candidate[],
  buyer: Buyer,
  label: (terms: PromoTerms) => string,
  code?: string,
): Cart {
  if (!cart.currency) return cart;
  const currency = cart.currency;
  const source = cart.lines.filter((line) => line.available && line.quantity > 0);
  const itemsMinor = cartTotals(cart.lines).totalMinor;
  const promo: NonNullable<Cart["promo"]> = code ? { code, reason: "unknown" } : {};
  const ranked: { offer: Candidate; lines: CartLine[]; amount: number }[] = [];
  const hints: { missingMinor: number; label: string; amount: number; id: string; publicInCart?: boolean }[] = [];
  for (const offer of candidates) {
    const manual = offer.terms.kind === "code";
    if (manual && (!code || code !== offer.terms.code)) continue;
    const result = assess(offer, source, buyer);
    if ("base" in result && result.base !== undefined) {
      const amount = discountAmount(offer.terms, result.base, currency);
      if (amount) ranked.push({ offer, amount, lines: result.lines });
      continue;
    }
    const reason: PromoReason = result.reason;
    if (manual && (promo.reason === "unknown" || offer.status === "active"))
      Object.assign(promo, { reason, missingMinor: result.missingMinor, missingQuantity: result.missingQuantity });
    if (!manual && reason === "telegram" && offer.terms.purchase) promo.telegramHint = true;
    if (!manual && reason === "minimum" && result.missingMinor) {
      const amount = discountAmount(offer.terms, offer.terms.minimumMinor ?? 0, currency);
      if (amount)
        hints.push({
          missingMinor: result.missingMinor,
          label: label(offer.terms),
          amount,
          id: offer.id,
          publicInCart: offer.terms.publicInCart,
        });
    }
  }
  const winner = ranked.sort(
    (a, b) =>
      b.amount - a.amount ||
      Number(a.offer.terms.kind === "code") - Number(b.offer.terms.kind === "code") ||
      a.offer.id.localeCompare(b.offer.id),
  )[0];
  if (ranked.some(({ offer }) => offer.terms.kind === "code"))
    promo.reason = winner.offer.terms.kind === "code" ? "applied" : "better_automatic";
  const entered = candidates.find(({ terms }) => terms.kind === "code" && terms.code === code);
  if (entered) promo.offerType = entered.terms.group?.type ?? "discount";
  // A percentage competitor can also grow as goods are added. Do not promise a speculative win.
  const hint = hints
    .filter(
      (candidate) =>
        candidate.amount > (winner?.amount ?? 0) &&
        !ranked.some(
          ({ offer }) =>
            offer.terms.discount.type === "percent" &&
            discountAmount(offer.terms, addMinor(itemsMinor, candidate.missingMinor), currency) >= candidate.amount,
        ),
    )
    .sort((a, b) => a.missingMinor - b.missingMinor || b.amount - a.amount || a.id.localeCompare(b.id))[0];
  if (hint)
    promo.hint = {
      missingMinor: hint.missingMinor,
      label: hint.label,
      publicOfferId: hint.publicInCart ? hint.id : undefined,
    };
  const adjustments: CartAdjustment[] = [];
  if (winner) {
    const { offer, amount } = winner;
    const lines = winner.lines.toSorted((a, b) => a.variantId.localeCompare(b.variantId));
    const weights = lines.map((line) => multiplyMinor(line.priceMinor, line.quantity));
    const amounts = allocateMinor(amount, weights);
    adjustments.push({
      kind: "promotion",
      sourceId: offer.id,
      sourceRevision: offer.revision,
      label: label(offer.terms),
      amount: -amount,
      code: offer.terms.code,
      purchase: offer.terms.purchase,
      minimumMinor: offer.terms.minimumMinor,
      allocations: lines.map((line, index) => ({ variantId: line.variantId, amount: amounts[index] })),
    });
  }
  const totals = cartTotals(cart.lines, adjustments);
  const savings = new Map(adjustments[0]?.allocations?.map(({ variantId, amount }) => [variantId, amount]));
  return {
    ...cart,
    ...totals,
    itemsMinor,
    promo,
    lines: totals.lines.map((line) => ({
      ...line,
      totalMinor: line.totalMinor - (savings.get(line.variantId) ?? 0),
    })),
  };
}
