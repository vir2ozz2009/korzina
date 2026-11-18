import { Navigate, useNavigate, useSearch } from "@tanstack/react-router";
import { Check, MapPin, Store } from "lucide-react";
import { Header } from "../../../app/shell/Header";
import { Screen } from "../../../app/shell/Screen";
import { formatMinor } from "../../../shared/money";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { ListItem } from "../../../ui/ListItem";
import { formatDay } from "../../receiving";
import { useOrder } from "../api";
import { readAttempt, readOrderNumber } from "../session";
import { PurchaseTotals } from "./PurchaseTotals";

export function DoneScreen() {
  const search = useSearch({ strict: false });
  const number =
    ("order" in search && typeof search.order === "number" ? search.order : undefined) ?? readOrderNumber();
  const query = useOrder(number);
  const navigate = useNavigate();
  const order = query.data;
  const home = () => void navigate({ to: "/", search: (previous) => ({ shop: previous.shop }), replace: true });
  if (!order && !number && readAttempt())
    return <Navigate to="/checkout/payment" search={(previous) => ({ shop: previous.shop })} replace />;
  const address =
    order?.receiving.mode === "delivery"
      ? order.receiving.address
      : order?.fulfillment.mode === "pickup"
        ? order.fulfillment.pickup.address
        : undefined;
  const time = order?.time
    ? [formatDay(order.time.date), order.time.slotId?.replace("-", "–")].filter(Boolean).join(", ")
    : "Время согласует магазин";
  const transfer = order?.transferReview;
  return (
    <Screen
      template="feedback"
      header={<Header title="Готово" />}
      footer={
        <Button full onClick={home}>
          К покупкам
        </Button>
      }
    >
      {order ? (
        <>
          <Card className="text-center">
            <div className="mx-auto w-fit rounded-pill bg-primary-soft p-3 text-primary-strong">
              <Check size={28} aria-hidden />
            </div>
            <h1 className="text-title-1">Заказ №{order.number}</h1>
            <p>Заказ сохранён</p>
            <p>
              {order.payment === "cash"
                ? `Оплатите ${formatMinor(order.totalMinor, order.currency)} при получении`
                : "Чек отправлен. Магазин проверит оплату."}
            </p>
          </Card>
          <ListItem
            icon={order.receiving.mode === "delivery" ? <MapPin size={22} /> : <Store size={22} />}
            title="Получение"
            subtitle={[address, time].filter(Boolean).join(" · ")}
          />
          <PurchaseTotals {...order} done />
          {transfer && (transfer.credentialsChanged || transfer.differenceMinor !== 0) && (
            <Card>
              {transfer.differenceMinor !== 0 && (
                <p>
                  {transfer.differenceMinor > 0 ? "Доплата" : "Переплата"}{" "}
                  {formatMinor(Math.abs(transfer.differenceMinor), order.currency)}
                </p>
              )}
              {transfer.credentialsChanged && <p>Магазин проверит перевод по прежним реквизитам</p>}
            </Card>
          )}
          {query.isError && (
            <Button variant="secondary" onClick={() => void query.refetch()}>
              Повторить
            </Button>
          )}
        </>
      ) : (
        <Card>
          <p role="status">{number && query.isPending ? "Проверяем результат…" : "Заказ недоступен"}</p>
          {number && query.isError && (
            <Button full variant="secondary" loading={query.isFetching} onClick={() => void query.refetch()}>
              Повторить
            </Button>
          )}
        </Card>
      )}
    </Screen>
  );
}
