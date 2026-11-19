import type { BuyerOrder } from "../../../shared/contracts/buyer-order";
import { formatMinor } from "../../../shared/money";
import { Card } from "../../../ui/Card";

function paymentText(order: BuyerOrder) {
  if (order.stage === "cancelled") {
    if (order.refundMinor !== undefined) return `К возврату ${formatMinor(order.refundMinor, order.currency)}`;
    if (order.paymentStatus === "pending_review") return "Оплата на проверке. Если деньги поступили, магазин их вернёт";
    return "Оплата не требуется";
  }
  switch (order.paymentStatus) {
    case "confirmed":
      return "Оплачено";
    case "rejected":
      return "Магазин не подтвердил оплату — свяжитесь с магазином";
    case "pending_review":
      return "Чек отправлен, магазин проверит";
    default:
      return "Оплатите при получении";
  }
}

export function OrderPayment({ order }: { order: BuyerOrder }) {
  return (
    <Card>
      <p className="text-label">{order.payment === "cash" ? "Наличные" : "Перевод"}</p>
      <p>{paymentText(order)}</p>
    </Card>
  );
}
