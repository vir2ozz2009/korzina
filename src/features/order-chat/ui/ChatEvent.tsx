import type { OrderChatHistory } from "../../../shared/contracts/order-chat";
import { formatMinor } from "../../../shared/money";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";

export const eventLabel: Record<string, string> = {
  "composition.proposed": "Магазин предлагает замену",
  "composition.applied": "Изменения сохранены",
  "composition.answered": "Получен ответ по замене",
  "composition.expired": "Срок ответа истёк",
  "time.pending": "Предложено другое время",
  "time.accepted": "Время изменено",
  "time.withdrawn": "Предложение отозвано",
  "time.kept": "Время осталось прежним",
  "order.accept": "Заказ принят",
  "order.markReady": "Заказ готов",
  "order.handOver": "Передан курьеру",
  "order.markPickedUp": "Заказ выдан",
  "order.complete": "Заказ завершён",
  "order.cancel": "Заказ отменён",
  "order.cancelled": "Заказ отменён",
  "order.recordPayment": "Оплата получена",
};

export function BalanceCard({
  balance,
  onOrder,
}: {
  balance: NonNullable<OrderChatHistory["balance"]>;
  onOrder: () => void;
}) {
  return (
    <Card>
      <p className="text-label">
        {balance.kind === "topUp" ? "К доплате" : "К возврату"} {formatMinor(balance.amountMinor, balance.currency)}
      </p>
      <Button variant="ghost" onClick={onOrder}>
        Открыть заказ
      </Button>
    </Card>
  );
}
