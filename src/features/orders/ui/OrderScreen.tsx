import { useNavigate, useParams } from "@tanstack/react-router";
import { Bike, Store } from "lucide-react";
import { useState } from "react";
import { Header } from "../../../app/shell/Header";
import { Screen } from "../../../app/shell/Screen";
import { useToast } from "../../../app/shell/ToastProvider";
import type { OrderStage } from "../../../shared/contracts/buyer-order";
import { orderLineKey } from "../../../shared/contracts/order-changes";
import { formatReceivingTime, shopDateTime } from "../../../shared/datetime";
import { errorKind, HttpError } from "../../../shared/http-error";
import { buyerOrderSearch, shopTimeZone } from "../../../shared/shop-api";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { EmptyState } from "../../../ui/EmptyState";
import { ListItem } from "../../../ui/ListItem";
import { ProductRow } from "../../../ui/ProductRow";
import { StatusPill } from "../../../ui/StatusPill";
import { PurchaseTotals } from "../../checkout";
import { ContactSheet } from "../../contact";
import { TimeControls } from "../../order-changes";
import { useBuyerOrder } from "../api";
import { buyerStageLabel } from "./active-orders";
import { CancelOrderSheet } from "./CancelOrderSheet";
import { OrderContactsSheet } from "./OrderContactsSheet";
import { OrderPayment } from "./OrderPayment";
import { OrderProofSheet } from "./OrderProofSheet";
import { RepeatSheet } from "./RepeatSheet";
import { TopUpSheet } from "./TopUpSheet";

export function OrderScreen() {
  const { number: raw } = useParams({ from: "/orders/$number" });
  const number = Number(raw);
  const query = useBuyerOrder(number);
  const order = query.data;
  const navigate = useNavigate();
  const toast = useToast();
  const [sheet, setSheet] = useState<"cancel" | "repeat" | "proof" | "contacts" | "login" | "top-up">();
  const close = () => setSheet(undefined);
  const home = () => void navigate({ to: "/", search: buyerOrderSearch });
  const header = <Header title={`Заказ №${raw}`} />;
  if (
    !Number.isSafeInteger(number) ||
    number <= 0 ||
    (query.error instanceof HttpError && query.error.code === "NOT_FOUND")
  )
    return (
      <Screen template="order" header={header}>
        <EmptyState title="Заказ недоступен" action="К покупкам" onAction={home} />
      </Screen>
    );
  if (query.isError && errorKind(query.error) === "access")
    return (
      <Screen template="order" header={header}>
        <EmptyState title="Войдите в магазин" action="Войти" onAction={() => setSheet("login")} />
        <ContactSheet
          mode={sheet === "login" ? "telegram" : undefined}
          close={() => {
            close();
            void query.refetch();
          }}
        />
      </Screen>
    );
  const disabled = query.isError;
  const stages: OrderStage[] = [
    "placed",
    "accepted",
    order?.receiving.mode === "pickup" ? "ready" : "handed",
    "completed",
  ];
  const address =
    order?.receiving.mode === "delivery"
      ? [order.receiving.address, order.receiving.apartment && `кв. ${order.receiving.apartment}`]
          .filter(Boolean)
          .join(", ")
      : order?.fulfillment.mode === "pickup"
        ? order.fulfillment.pickup.address
        : "";
  return (
    <Screen template="order" header={header} state={{ query }}>
      {order && (
        <>
          {query.isError && (
            <p role="status">
              Обновлено {shopDateTime(query.dataUpdatedAt, shopTimeZone).time}
              <Button variant="ghost" onClick={() => void query.refetch()}>
                Повторить
              </Button>
            </p>
          )}
          <Card className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-title-2">{buyerStageLabel(order.stage, order.receiving.mode)}</h2>
              <StatusPill
                tone={order.stage === "cancelled" ? "danger" : order.stage === "completed" ? "success" : "primary"}
              >
                {order.stage === "cancelled" ? "Отменён" : order.stage === "completed" ? "Выполнен" : "В работе"}
              </StatusPill>
            </div>
            {order.stage === "placed" && <p>Магазин скоро возьмёт заказ в работу</p>}
            {order.stage !== "cancelled" && (
              <ol className="grid grid-cols-4 gap-2 text-small" aria-label="Этапы заказа">
                {stages.map((stage, index) => (
                  <li key={stage} aria-current={stage === order.stage ? "step" : undefined}>
                    <div
                      className={`mb-1 h-1 rounded-pill ${index <= stages.indexOf(order.stage) ? "bg-primary" : "bg-border"}`}
                    />
                    {buyerStageLabel(stage, order.receiving.mode)}
                  </li>
                ))}
              </ol>
            )}
          </Card>
          <ListItem
            title={order.receiving.mode === "delivery" ? "Доставка" : "Самовывоз"}
            icon={order.receiving.mode === "delivery" ? <Bike size={22} /> : <Store size={22} />}
            subtitle={[address, order.time && formatReceivingTime(order.time, shopTimeZone)]
              .filter(Boolean)
              .join(" · ")}
          />
          <TimeControls
            number={number}
            revision={order.version}
            time={order.time}
            timeZone={shopTimeZone}
            change={order.timeChange}
            editable={order.canCancel}
            compositionPending={!!order.composition?.expiresAt}
          />
          {order.composition && (
            <ListItem
              title={order.composition.expiresAt ? "Магазин предлагает замену" : "Изменения заказа"}
              subtitle="Посмотреть изменения"
              onClick={() =>
                void navigate({
                  to: "/orders/$number/changes",
                  params: { number: String(number) },
                  search: buyerOrderSearch,
                })
              }
            />
          )}
          <Card className="space-y-3">
            <h2 className="text-title-3">Состав заказа</h2>
            {order.lines.map((line) => (
              <ProductRow
                key={orderLineKey(line)}
                name={line.name}
                unit={line.unit}
                image={line.image ?? undefined}
                quantity={line.quantity}
                amountMinor={line.totalMinor}
                currency={order.currency}
                variant="order"
              />
            ))}
          </Card>
          <PurchaseTotals {...order} done />
          <OrderPayment order={order} onTopUp={() => setSheet("top-up")} />
          <Button
            full
            variant="secondary"
            onClick={() =>
              void navigate({
                to: "/orders/$number/chat",
                params: { number: String(number) },
                search: buyerOrderSearch,
              })
            }
          >
            Чат с магазином
          </Button>
          <Button full variant="secondary" onClick={() => setSheet("contacts")}>
            Связь с магазином
          </Button>
          {order.canReplaceProof && (
            <Button full variant="secondary" disabled={disabled} onClick={() => setSheet("proof")}>
              {order.debtMinor ? "Прислать чек" : "Заменить подтверждение оплаты"}
            </Button>
          )}
          {order.canCancel && (
            <Button full variant="secondary" disabled={disabled} onClick={() => setSheet("cancel")}>
              Отменить заказ
            </Button>
          )}
          <Button full disabled={disabled} onClick={() => setSheet("repeat")}>
            Повторить заказ
          </Button>
          <Button full variant="ghost" onClick={() => void navigate({ to: "/orders", search: buyerOrderSearch })}>
            Мои заказы
          </Button>
          <Button full variant="ghost" onClick={home}>
            К покупкам
          </Button>
          {sheet === "cancel" && <CancelOrderSheet order={order} close={close} refresh={() => void query.refetch()} />}
          {sheet === "repeat" && <RepeatSheet number={number} currency={order.currency} close={close} />}
          {sheet === "top-up" && <TopUpSheet order={order} close={close} />}
          {sheet === "proof" && (
            <OrderProofSheet
              order={order}
              close={close}
              saved={() => {
                close();
                toast("Чек сохранён");
              }}
            />
          )}
          {sheet === "contacts" && <OrderContactsSheet close={close} />}
        </>
      )}
    </Screen>
  );
}
