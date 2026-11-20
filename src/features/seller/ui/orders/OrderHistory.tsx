import type { RecordedPayment, SellerOrder } from "../../../../shared/contracts/seller-order";
import { formatShopTimestamp } from "../../../../shared/datetime";
import { formatMinor } from "../../../../shared/money";
import { Card } from "../../../../ui/Card";
import { paymentLabel } from "./OrderPaymentSheet";

const eventLabel: Record<string, string> = {
  "order.accept": "Заказ принят",
  "order.setLinePacked": "Отметка сборки",
  "order.setAllPacked": "Изменены отметки сборки",
  "order.markReady": "Сборка завершена",
  "order.handOver": "Передан курьеру",
  "order.markPickedUp": "Выдан",
  "order.complete": "Доставлен",
  "order.cancel": "Заказ отменён",
  "order.cancelled": "Покупатель отменил заказ",
  "order.rollback": "Статус возвращён",
  "order.recordPayment": "Записана оплата",
  "order.correctPayment": "Оплата исправлена",
  "order.confirmTransfer": "Перевод подтверждён",
  "order.rejectProof": "Чек отклонён",
  "order.waiveDue": "Долг списан",
  "order.markRefundReturned": "Возврат отмечен",
  "order.setDeliveryFee": "Назначена стоимость доставки",
};

export function OrderHistory({ order }: { order: SellerOrder }) {
  if (!order.events.length) return null;
  const money = (value: RecordedPayment) =>
    `${paymentLabel[value.method]} · ${formatMinor(value.amountMinor, order.currency)}`;
  return (
    <Card>
      <details>
        <summary className="min-h-11 cursor-pointer content-center text-title-3">История заказа</summary>
        <ul className="space-y-3">
          {order.events.map((event) => {
            const correction =
              event.event === "order.correctPayment" && event.details
                ? (JSON.parse(event.details) as { previous: RecordedPayment; current: RecordedPayment })
                : undefined;
            return (
              <li key={event.id} className="border-b border-border pb-2 last:border-0">
                <p className="text-label">{eventLabel[event.event] ?? event.event}</p>
                <p className="text-meta text-muted-foreground">
                  <time dateTime={new Date(event.createdAt).toISOString()}>
                    {formatShopTimestamp(event.createdAt, order.timeZone)}
                  </time>{" "}
                  ·{" "}
                  <span title={event.actor}>
                    {event.actor.startsWith("guest:") || event.event === "order.cancelled"
                      ? "Покупатель"
                      : `Продавец · ${event.actor.slice(0, 8)}`}
                  </span>
                </p>
                {correction && (
                  <p className="text-meta">
                    Было · {money(correction.previous)} → {money(correction.current)}
                  </p>
                )}
                {event.reason && <p className="break-words text-meta">{event.reason}</p>}
              </li>
            );
          })}
        </ul>
      </details>
    </Card>
  );
}
