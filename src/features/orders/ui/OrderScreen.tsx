import { useNavigate, useParams } from "@tanstack/react-router";
import { Bike, Store } from "lucide-react";
import { useRef, useState } from "react";
import { Header } from "../../../app/shell/Header";
import { Screen } from "../../../app/shell/Screen";
import { useToast } from "../../../app/shell/ToastProvider";
import type { BuyerOrder, OrderStage } from "../../../shared/contracts/buyer-order";
import { errorKind, HttpError } from "../../../shared/http-error";
import { formatMinor } from "../../../shared/money";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { EmptyState } from "../../../ui/EmptyState";
import { ListItem } from "../../../ui/ListItem";
import { ProductRow } from "../../../ui/ProductRow";
import { Sheet } from "../../../ui/Sheet";
import { StatusPill } from "../../../ui/StatusPill";
import { PurchaseTotals, useShopContacts } from "../../checkout";
import { ContactSheet } from "../../contact";
import { useBuyerOrder, useOrderChange } from "../api";
import { orderStages, orderTime } from "./active-orders";
import { OrderProofSheet } from "./OrderProofSheet";
import { RepeatSheet } from "./RepeatSheet";

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

export function OrderScreen() {
  const { number: raw } = useParams({ from: "/orders/$number" });
  const number = Number(raw);
  const query = useBuyerOrder(number);
  const order = query.data;
  const navigate = useNavigate();
  const toast = useToast();
  const [sheet, setSheet] = useState<"cancel" | "repeat" | "proof" | "contacts" | "login">();
  const change = useOrderChange(number);
  const contacts = useShopContacts(sheet === "contacts");
  const close = () => setSheet(undefined);
  const attempt = useRef<{ key: string; expectedVersion: number }>(undefined);
  const home = () => void navigate({ to: "/" });
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
  const disabled = query.isError || change.isPending;
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
              Обновлено {new Date(query.dataUpdatedAt).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}
              <Button variant="ghost" onClick={() => void query.refetch()}>
                Повторить
              </Button>
            </p>
          )}
          <Card className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-title-2">{orderStages[order.stage]}</h2>
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
                    {orderStages[stage]}
                  </li>
                ))}
              </ol>
            )}
          </Card>
          <ListItem
            title={order.receiving.mode === "delivery" ? "Доставка" : "Самовывоз"}
            icon={order.receiving.mode === "delivery" ? <Bike size={22} /> : <Store size={22} />}
            subtitle={[address, orderTime(order.time)].filter(Boolean).join(" · ")}
          />
          <Card className="space-y-3">
            <h2 className="text-title-3">Состав заказа</h2>
            {order.lines.map((line) => (
              <ProductRow
                key={line.variantId}
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
          <Card>
            <p className="text-label">{order.payment === "cash" ? "Наличные" : "Перевод"}</p>
            <p>{paymentText(order)}</p>
          </Card>
          <Button full variant="secondary" onClick={() => setSheet("contacts")}>
            Связь с магазином
          </Button>
          {order.canReplaceProof && (
            <Button full variant="secondary" disabled={disabled} onClick={() => setSheet("proof")}>
              Заменить подтверждение оплаты
            </Button>
          )}
          {order.canCancel && (
            <Button
              full
              variant="secondary"
              disabled={disabled}
              onClick={() => {
                change.reset();
                attempt.current = { key: crypto.randomUUID(), expectedVersion: order.version };
                setSheet("cancel");
              }}
            >
              Отменить заказ
            </Button>
          )}
          <Button full disabled={disabled} onClick={() => setSheet("repeat")}>
            Повторить заказ
          </Button>
          <Button full variant="ghost" onClick={home}>
            К покупкам
          </Button>
          {sheet === "cancel" && (
            <Sheet
              open
              title={`Отменить заказ №${number}?`}
              onOpenChange={(open) => {
                if (!open && !change.isPending) close();
              }}
            >
              <div className="space-y-2">
                {change.error && <p role="alert">{change.error.message}</p>}
                <Button
                  full
                  loading={change.isPending}
                  disabled={!order.canCancel}
                  onClick={() => {
                    if (attempt.current)
                      change.mutate(attempt.current, {
                        onSuccess: () => {
                          close();
                          toast("Заказ отменён");
                        },
                        onError: (error) => {
                          if (
                            error instanceof HttpError &&
                            ["CANCEL_NOT_ALLOWED", "VERSION_CONFLICT"].includes(error.code ?? "")
                          ) {
                            void query.refetch();
                            attempt.current = undefined;
                          }
                        },
                      });
                  }}
                >
                  Отменить заказ
                </Button>
                {change.isPending && <p role="status">Отменяем…</p>}
                <Button full variant="secondary" disabled={change.isPending} onClick={close}>
                  Оставить заказ
                </Button>
              </div>
            </Sheet>
          )}
          {sheet === "repeat" && <RepeatSheet number={number} currency={order.currency} close={close} />}
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
          {sheet === "contacts" && (
            <Sheet
              open
              title="Связь с магазином"
              onOpenChange={(open) => {
                if (!open) close();
              }}
            >
              {contacts.isPending && <p role="status">Загружаем контакты…</p>}
              {contacts.isError && <Button onClick={() => void contacts.refetch()}>Повторить</Button>}
              {contacts.data?.length === 0 && <p>Контакты магазина пока не указаны</p>}
              {contacts.data?.map(({ title, href }) => (
                <ListItem key={href} title={title} href={href} />
              ))}
            </Sheet>
          )}
        </>
      )}
    </Screen>
  );
}
