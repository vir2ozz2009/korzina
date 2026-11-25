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

export function OrderPayment({
  order,
  onTopUp,
  refundDetails,
  replaceProof,
}: {
  order: BuyerOrder;
  onTopUp?: () => void;
  refundDetails?: () => void;
  replaceProof?: () => void;
}) {
  const changed = order.composition?.totals;
  const cash = (order.topUpPayment?.id ?? order.paymentOption?.id ?? order.payment) === "cash";
  const option = order.paymentOption?.name ?? (order.payment === "cash" ? "Наличными при получении" : "Перевод");
  const topUp = !!order.debtMinor && onTopUp;
  const replacementRaisedPrice = !!order.debtMinor && changed && changed.currentMinor > changed.originalMinor;
  const payment =
    order.paymentStatus === "pending_review" && order.topUpPayment
      ? "Чек отправлен, магазин проверит"
      : paymentText(order);
  return (
    <Card>
      <p className="text-label">Оплата · {option}</p>
      {changed && !replacementRaisedPrice && (
        <>
          <p>
            Итого {formatMinor(changed.currentMinor, order.currency)} (было{" "}
            {formatMinor(changed.originalMinor, order.currency)})
          </p>
          {!!changed.paidMinor && <p>Оплачено {formatMinor(changed.paidMinor ?? 0, order.currency)}</p>}
        </>
      )}
      {replacementRaisedPrice && changed && (
        <p>
          После замены сумма заказа выросла с {formatMinor(changed.originalMinor, order.currency)} до{" "}
          {formatMinor(changed.currentMinor, order.currency)}. Уже оплачено{" "}
          {formatMinor(changed.paidMinor ?? 0, order.currency)}.
        </p>
      )}
      {order.topUp?.status === "pending_review" ? (
        <>
          <p>Подтверждение отправлено · повторно платить не нужно</p>
          <Button full variant="secondary" onClick={replaceProof}>
            Заменить чек
          </Button>
        </>
      ) : order.topUp?.status === "rejected" ? (
        <>
          <p>Магазин не подтвердил оплату</p>
          {order.topUp.reason && <p>{order.topUp.reason}</p>}
          <Button full onClick={replaceProof}>
            Прикрепить чек
          </Button>
        </>
      ) : topUp && cash ? (
        <>
          <p>Нужно доплатить {formatMinor(order.debtMinor ?? 0, order.currency)}</p>
          <p>Отдайте {order.receiving.mode === "delivery" ? "курьеру при получении" : "при получении"}</p>
          <Button full variant="secondary" onClick={onTopUp}>
            Оплатить иначе
          </Button>
        </>
      ) : (
        <>
          <p>{topUp ? `Нужно доплатить ${formatMinor(order.debtMinor ?? 0, order.currency)}` : payment}</p>
          {topUp && (
            <Button full onClick={onTopUp}>
              Доплатить
            </Button>
          )}
        </>
      )}
      {order.refund && (
        <>
          {order.refund.details ? (
            <p>Реквизиты переданы, деньги ожидаются</p>
          ) : (
            <Button full variant="secondary" onClick={refundDetails}>
              Указать реквизиты
            </Button>
          )}
          {!!order.returnedMinor && (
            <>
              <p>Возвращено {formatMinor(order.returnedMinor, order.currency)}</p>
              <p>Осталось вернуть {formatMinor(order.refund.amountMinor, order.currency)}</p>
            </>
          )}
        </>
      )}
      {!order.refund && !!order.returnedMinor && <p>Деньги возвращены</p>}
    </Card>
  );
}
