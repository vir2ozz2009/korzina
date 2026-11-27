import type { DeliveryBenefit } from "./contracts/promo";

export function deliveryBenefitLabel(benefit: DeliveryBenefit | undefined) {
  if (!benefit || benefit.state === "released") return undefined;
  return benefit.state === "reserved"
    ? benefit.code
      ? "Доставка будет бесплатной по промокоду"
      : "Доставка будет бесплатной от суммы заказа"
    : benefit.code
      ? "Доставка бесплатно по промокоду"
      : "Доставка бесплатно от суммы заказа";
}
