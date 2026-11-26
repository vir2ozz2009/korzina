import type { Cart } from "../../../shared/contracts/cart";
import type { PromoReason } from "../../../shared/contracts/promo";
import { formatMinor } from "../../../shared/money";

const descriptions: Partial<Record<PromoReason, string>> = {
  better_automatic: "Скидка магазина выгоднее",
  unknown: "Код не найден",
  expired: "Срок действия закончился",
  disabled: "Код больше не действует",
  scheduled: "Срок действия ещё не начался",
  limit: "Лимит исчерпан",
  personal_limit: "Вы уже использовали этот промокод",
  telegram: "Подключите Telegram, чтобы проверить условия",
  purchase_early: "Скидка станет доступна после выполненных покупок",
  purchase_passed: "Скидка действует на другой номер заказа",
  purchase_used: "Скидка на эту покупку уже использована",
  scope: "Добавьте подходящие товары",
  regular_price: "Промокод действует на товары без скидки",
};
export function promoMessage(
  promo: Pick<NonNullable<Cart["promo"]>, "reason" | "missingMinor" | "missingQuantity"> | undefined,
  currency: string,
) {
  if (promo?.reason === "minimum" && promo.missingMinor)
    return `Добавьте подходящих товаров ещё на ${formatMinor(promo.missingMinor, currency)}`;
  if (promo?.reason === "quantity" && !promo.missingQuantity) return "Проверьте состав набора и условия акции";
  if (promo?.reason === "quantity") return `Добавьте подходящие товары · ещё ${promo.missingQuantity} шт.`;
  return promo?.reason && descriptions[promo.reason];
}
