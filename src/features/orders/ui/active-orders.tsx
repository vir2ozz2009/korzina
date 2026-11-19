import { useNavigate } from "@tanstack/react-router";
import { Package } from "lucide-react";
import { telegramLaunch } from "../../../app/telegram/launch";
import type { OrderStage } from "../../../shared/contracts/buyer-order";
import type { TimeChoice } from "../../../shared/contracts/receiving-time";
import { errorKind } from "../../../shared/http-error";
import { hasBuyerMarker } from "../../../shared/shop-session";
import { Button } from "../../../ui/Button";
import { ListItem } from "../../../ui/ListItem";
import { useContact } from "../../contact";
import { formatDay } from "../../receiving";
import { useActiveOrders } from "../api";

export const orderStages: Record<OrderStage, string> = {
  placed: "Оформлен",
  accepted: "Собираем",
  handed: "Передан курьеру",
  ready: "Готов к выдаче",
  completed: "Завершён",
  cancelled: "Отменён",
};
export function orderTime(time: TimeChoice | null) {
  return time ? [formatDay(time.date), time.slotId?.replace("-", "–")].filter(Boolean).join(", ") : undefined;
}
export function ActiveOrders() {
  const contact = useContact(false);
  const query = useActiveOrders(
    !!(hasBuyerMarker() || contact.data?.phone || contact.data?.telegramLinked || telegramLaunch),
  );
  const navigate = useNavigate();
  const orders = query.data?.data.orders ?? [];
  if (!orders.length || (query.isError && errorKind(query.error) === "access")) return null;
  return (
    <section aria-label="Активные заказы" className="space-y-2">
      {orders.length > 1 && <h2 className="text-title-3">Активные заказы · {query.data?.data.count}</h2>}
      {orders.map(({ number, stage, time }) => (
        <ListItem
          key={number}
          title={`Заказ №${number}`}
          icon={<Package size={22} />}
          subtitle={[orderStages[stage], orderTime(time)].filter(Boolean).join(" · ")}
          onClick={() => void navigate({ to: "/orders/$number", params: { number: String(number) } })}
        />
      ))}
      {query.isError && (
        <div role="status">
          Обновлено {new Date(query.dataUpdatedAt).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}
          <Button variant="ghost" onClick={() => void query.refetch()}>
            Повторить
          </Button>
        </div>
      )}
    </section>
  );
}
