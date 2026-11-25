import type { PurchaseQuote } from "../../../src/shared/contracts/checkout";

export function quoteTerms(quote: PurchaseQuote) {
  const { receiving, fulfillment, time, paymentSettings } = quote;
  return {
    currency: quote.currency,
    lines: quote.lines.map(({ productId, variantId, name, unit, quantity, priceMinor, totalMinor }) => ({
      productId,
      variantId,
      name,
      unit,
      quantity,
      priceMinor,
      totalMinor,
    })),
    adjustments: quote.adjustments ?? [],
    itemsMinor: quote.itemsMinor,
    deliveryMinor: quote.deliveryMinor,
    totalMinor: quote.totalMinor,
    receiving:
      receiving.mode === "pickup"
        ? { mode: receiving.mode, comment: receiving.comment }
        : {
            mode: receiving.mode,
            address: receiving.address,
            point: receiving.point && { lat: receiving.point.lat, lon: receiving.point.lon },
            districtId: receiving.districtId,
            acceptedWithoutPoint: receiving.acceptedWithoutPoint,
            apartment: receiving.apartment,
            entrance: receiving.entrance,
            floor: receiving.floor,
            intercom: receiving.intercom,
            comment: receiving.comment,
          },
    fulfillment:
      fulfillment.mode === "pickup"
        ? { mode: fulfillment.mode, address: fulfillment.pickup.address, hours: fulfillment.pickup.hours }
        : {
            mode: fulfillment.mode,
            inZone: fulfillment.inZone,
            payee: fulfillment.payee,
            tariff: fulfillment.tariff,
            feeMinor: fulfillment.feeMinor,
            unverified: fulfillment.unverified,
          },
    time: time && { date: time.date, slotId: time.slotId },
    phone: quote.phone,
    telegramLinked: quote.telegramLinked,
    payment: {
      methods: paymentSettings.methods,
      minimumMinor: paymentSettings.minimumMinor,
      instruction: paymentSettings.instruction,
      qrSrc: paymentSettings.qrSrc,
      options: paymentSettings.options,
    },
  };
}
