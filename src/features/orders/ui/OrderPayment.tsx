import type { BuyerOrder } from "../../../shared/contracts/buyer-order";
import { formatMinor } from "../../../shared/money";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";

function paymentText(order: BuyerOrder) {
  if (order.refundMinor) return `Магазин вернёт вам ${formatMinor(order.refundMinor, order.currency)}`;
  if (order.debtMinor) return `Доплатите ${formatMinor(order.debtMinor, order.currency)}`;
  if (order.stage === "cancelled") {
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

export function OrderPayment({ order, onTopUp }: { order: BuyerOrder; onTopUp?: () => void }) {
  const changed = order.composition?.totals;
  const cash = (order.topUpPayment?.id ?? order.paymentOption?.id ?? order.payment) === "cash";
  const option = order.paymentOption?.name ?? (order.payment === "cash" ? "Наличными при получении" : "Перевод");
  const topUp = changed && !!order.debtMinor && onTopUp;
  const payment =
    order.paymentStatus === "pending_review" && order.topUpPayment
      ? "Чек отправлен, магазин проверит"
      : paymentText(order);
  return (
    <Card>
      <p className="text-label">Оплата · {option}</p>
      {changed && (
        <>
          <p>
            Итого {formatMinor(changed.currentMinor, order.currency)} (было{" "}
            {formatMinor(changed.originalMinor, order.currency)})
          </p>
          {!!changed.paidMinor && <p>Оплачено {formatMinor(changed.paidMinor, order.currency)}</p>}
        </>
      )}
      {topUp && cash ? (
        <>
          <p>Отдайте {order.receiving.mode === "delivery" ? "курьеру при получении" : "при получении"}</p>
          <Button full variant="secondary" onClick={onTopUp}>
            Оплатить иначе
          </Button>
        </>
      ) : (
        <>
          <p>{payment}</p>
          {topUp && (
            <Button full onClick={onTopUp}>
              Доплатить
            </Button>
          )}
        </>
      )}
    </Card>
  );
}
