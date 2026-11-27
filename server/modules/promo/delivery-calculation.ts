import type { Cart } from "../../../src/shared/contracts/cart";
import type { ReceivingAvailability } from "../../../src/shared/contracts/receiving";
import { addMinor, subtractMinor } from "../../../src/shared/money";
import type { assess as assessOffer, Buyer, Candidate } from "./calculate";

export type DeliveryContext = { feeMinor: number | null; applicable: boolean };
export function deliveryContextFor(availability: ReceivingAvailability | null, paused = false): DeliveryContext {
  return availability?.mode === "delivery" && availability.available
    ? { feeMinor: availability.feeMinor, applicable: availability.payee === "shop" && !paused }
    : { feeMinor: 0, applicable: false };
}

// Groups change the price of positions; an order-wide discount does not change this threshold.
function deliveryBase(cart: Cart) {
  return subtractMinor(
    cart.itemsMinor ?? cart.totalMinor,
    addMinor(...cart.adjustments.filter((item) => item.groups).map((item) => -item.amount)),
  );
}

export function priceDelivery(
  cart: Cart,
  candidates: Candidate[],
  buyer: Buyer,
  code: string | undefined,
  delivery: DeliveryContext | undefined,
  assess: typeof assessOffer,
): Cart {
  const entered = code ? candidates.find(({ terms }) => terms.kind === "code" && terms.code === code) : undefined;
  if (!delivery?.applicable) {
    return entered?.terms.delivery
      ? { ...cart, promo: { ...cart.promo, code, reason: "delivery", offerType: "delivery" } }
      : cart;
  }
  const source = cart.lines.filter((line) => line.available && line.quantity > 0);
  const base = deliveryBase(cart);
  const eligible = candidates.filter(
    ({ terms }) => terms.delivery && (terms.kind === "automatic" || (code && terms.code === code)),
  );
  const applicable: Candidate[] = [];
  const missing: number[] = [];
  let manualReason: ReturnType<typeof assess> | undefined;
  for (const offer of eligible) {
    const result = assess(offer, source, buyer, base);
    if (offer.terms.kind === "code") manualReason = result;
    if ("base" in result) {
      if (delivery.feeMinor !== 0) applicable.push(offer);
    } else if (offer.terms.kind === "automatic" && result.reason === "minimum" && result.missingMinor)
      missing.push(result.missingMinor);
  }
  const winner = applicable.sort(
    (a, b) => Number(a.terms.kind === "code") - Number(b.terms.kind === "code") || a.id.localeCompare(b.id),
  )[0];
  const pricedDelivery: NonNullable<Cart["delivery"]> = {
    baseMinor: delivery.feeMinor,
    feeMinor: winner ? 0 : delivery.feeMinor,
  };
  const result: Cart = { ...cart, delivery: pricedDelivery };
  if (winner)
    pricedDelivery.benefit = {
      offerId: winner.id,
      revision: winner.revision,
      name: winner.terms.name,
      code: winner.terms.code,
      baseMinor: delivery.feeMinor,
      quotedBaseMinor: delivery.feeMinor,
      terms: winner.terms,
      amountMinor: delivery.feeMinor ?? 0,
      state: delivery.feeMinor === null ? "reserved" : "applied",
    };
  else if (missing.length && delivery.feeMinor !== 0) pricedDelivery.missingMinor = Math.min(...missing);
  if (entered?.terms.delivery)
    result.promo = {
      ...result.promo,
      code,
      offerType: "delivery",
      reason:
        manualReason && "reason" in manualReason
          ? manualReason.reason
          : winner?.id === entered.id
            ? "applied"
            : "better_automatic",
      missingMinor: manualReason && "missingMinor" in manualReason ? manualReason.missingMinor : undefined,
    };
  return result;
}
