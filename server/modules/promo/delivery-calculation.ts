import type { Cart } from "../../../src/shared/contracts/cart";
import type { ReceivingAvailability } from "../../../src/shared/contracts/receiving";
import { addMinor } from "../../../src/shared/money";
import type { assess as assessOffer, Buyer, Candidate } from "./calculate";

export type DeliveryContext = { feeMinor: number | null; applicable: boolean };
export function deliveryContextFor(availability: ReceivingAvailability | null, paused = false): DeliveryContext {
  return availability?.mode === "delivery" && availability.available
    ? { feeMinor: availability.feeMinor, applicable: availability.payee === "shop" && !paused }
    : { feeMinor: 0, applicable: false };
}

export function priceDelivery(
  cart: Cart,
  candidates: Candidate[],
  buyer: Buyer,
  code: string | undefined,
  delivery: { feeMinor: number | null; applicable: boolean } | undefined,
  price: (code?: string) => Cart,
  assess: typeof assessOffer,
): Cart {
  const entered = code ? candidates.find(({ terms }) => terms.kind === "code" && terms.code === code) : undefined;
  const priced = price(code);
  if (!delivery?.applicable) {
    if (entered?.terms.delivery) priced.promo = { ...priced.promo, code, reason: "delivery", offerType: "delivery" };
    return priced;
  }
  const source = cart.lines.filter((line) => line.available && line.quantity > 0);
  const automaticGoods = () => price();
  const eligible = candidates.filter(
    ({ terms }) => terms.delivery && (terms.kind === "automatic" || (code && terms.code === code)),
  );
  const ranked: { offer?: Candidate; goods: Cart; fee: number | null }[] = [{ goods: priced, fee: delivery.feeMinor }];
  const missing: number[] = [];
  let manualReason: ReturnType<typeof assess> | undefined;
  for (const offer of eligible) {
    const result = assess(offer, source, buyer);
    if (offer.terms.kind === "code") manualReason = result;
    if ("base" in result) {
      if (delivery.feeMinor !== 0)
        ranked.push({ offer, goods: offer.terms.kind === "code" ? automaticGoods() : priced, fee: 0 });
    } else if (offer.terms.kind === "automatic" && result.reason === "minimum" && result.missingMinor) {
      missing.push(result.missingMinor);
    }
  }
  const total = (value: (typeof ranked)[number]) => addMinor(value.goods.totalMinor, value.fee ?? 0);
  const winner = ranked.sort(
    (a, b) =>
      total(a) - total(b) ||
      Number(!a.offer) - Number(!b.offer) ||
      Number(a.offer?.terms.kind === "code") - Number(b.offer?.terms.kind === "code") ||
      (a.offer?.id ?? "").localeCompare(b.offer?.id ?? ""),
  )[0];
  const result = winner.goods;
  result.delivery = { baseMinor: delivery.feeMinor, feeMinor: winner.fee };
  if (winner.offer)
    result.delivery.benefit = {
      offerId: winner.offer.id,
      revision: winner.offer.revision,
      name: winner.offer.terms.name,
      code: winner.offer.terms.code,
      baseMinor: delivery.feeMinor,
      quotedBaseMinor: delivery.feeMinor,
      terms: winner.offer.terms,
      amountMinor: delivery.feeMinor ?? 0,
      state: delivery.feeMinor === null ? "reserved" : "applied",
    };
  else if (missing.length && delivery.feeMinor !== 0) result.delivery.missingMinor = Math.min(...missing);
  if (entered?.terms.delivery) {
    result.promo = {
      ...result.promo,
      code,
      offerType: "delivery",
      reason:
        manualReason && "reason" in manualReason
          ? manualReason.reason
          : winner.offer?.id === entered.id
            ? "applied"
            : "better_automatic",
      missingMinor: manualReason && "missingMinor" in manualReason ? manualReason.missingMinor : undefined,
    };
  } else if (code && winner.offer?.terms.kind === "code") result.promo = { ...result.promo, code, reason: "applied" };
  return result;
}
