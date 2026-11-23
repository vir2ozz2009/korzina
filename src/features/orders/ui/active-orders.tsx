import { useNavigate } from "@tanstack/react-router";
import { Package } from "lucide-react";
import { telegramLaunch } from "../../../app/telegram/launch";
import type { OrderStage } from "../../../shared/contracts/buyer-order";
import { formatReceivingTime, shopDateTime } from "../../../shared/datetime";
import { errorKind } from "../../../shared/http-error";
import { formatMinor } from "../../../shared/money";
import { buyerOrderSearch, shopTimeZone } from "../../../shared/shop-api";
import { hasBuyerMarker } from "../../../shared/shop-session";
import { Button } from "../../../ui/Button";
import { ListItem } from "../../../ui/ListItem";
import { useContact } from "../../contact";
import { useActiveOrders } from "../api";

const orderStages: Record<OrderStage, string> = {
  placed: "Оформлен",
  accepted: "Собираем",
  handed: "Передан курьеру",
  ready: "Готов к выдаче",
  completed: "Завершён",
  cancelled: "Отменён",
};
export function buyerStageLabel(stage: OrderStage, method?: "delivery" | "pickup") {
  if (stage === "ready" && method === "delivery") return "Собираем";
  if (stage === "completed" && method) return method === "pickup" ? "Выдан" : "Доставлен";
  return orderStages[stage];
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
      {orders.map(({ number, stage, time, debtMinor, currency, method, changeId }) =>
        changeId ? (
          <ListItem
            key={number}
            title="Магазин предлагает замену"
            subtitle={`Заказ №${number}`}
            onClick={() =>
              void navigate({
                to: "/orders/$number/changes",
                params: { number: String(number) },
                search: buyerOrderSearch,
              })
            }
          />
        ) : debtMinor && currency ? (
          <Button
            key={number}
            full
            variant="soft"
            className="justify-start"
            subtitle={`Заказ №${number}`}
            onClick={() =>
              void navigate({ to: "/orders/$number", search: buyerOrderSearch, params: { number: String(number) } })
            }
          >
            Доплатите {formatMinor(debtMinor, currency)}
          </Button>
        ) : (
          <ListItem
            key={number}
            title={`Заказ №${number}`}
            icon={<Package size={22} />}
            subtitle={[buyerStageLabel(stage, method), time && formatReceivingTime(time, shopTimeZone)]
              .filter(Boolean)
              .join(" · ")}
            onClick={() =>
              void navigate({ to: "/orders/$number", search: buyerOrderSearch, params: { number: String(number) } })
            }
          />
        ),
      )}
      {query.isError && (
        <div role="status">
          Обновлено {shopDateTime(query.dataUpdatedAt, shopTimeZone).time}
          <Button variant="ghost" onClick={() => void query.refetch()}>
            Повторить
          </Button>
        </div>
      )}
    </section>
  );
}
