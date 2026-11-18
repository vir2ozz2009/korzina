import type { ReceivingAvailability } from "../../shared/contracts/receiving";
import { formatMinor } from "../../shared/money";

export function deliveryLabel(result: ReceivingAvailability | null, currency: string) {
  if (result?.mode === "pickup" && result.available) return "Самовывоз бесплатно";
  if (result?.mode !== "delivery" || !result.available) return "Рассчитаем по адресу";
  if (result.tariff === "free") return "Бесплатно";
  if (result.payee === "courier") {
    const cost = result.unverified
      ? "уточнит магазин"
      : result.feeMinor === null
        ? "по тарифу службы"
        : formatMinor(result.feeMinor, currency);
    return `Оплата курьеру · ${cost}`;
  }
  return result.feeMinor === null ? "Согласуем после заказа" : formatMinor(result.feeMinor, currency);
}
