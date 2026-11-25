import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { PromoOffer } from "../../../../shared/contracts/promo";
import { calendarDate, shopDateTime } from "../../../../shared/datetime";
import { formatMinor } from "../../../../shared/money";
import { Button } from "../../../../ui/Button";
import { Card } from "../../../../ui/Card";
import { Input } from "../../../../ui/Input";
import { ListItem } from "../../../../ui/ListItem";
import { SkeletonBlock } from "../../../../ui/SkeletonBlock";
import { promoRequest, type Report } from "./api";

export function PromoResults({
  offer,
  store,
  account,
  currency,
  zone,
  openOrder,
}: {
  offer: PromoOffer;
  store: string;
  account: string;
  currency: string;
  zone: string;
  openOrder: (number: number) => void;
}) {
  const [period, setPeriod] = useState("all");
  const [custom, setCustom] = useState({ from: "", through: "" });
  const [offset, setOffset] = useState(0);
  const [detail, setDetail] = useState(false);
  const through = shopDateTime(Date.now(), zone).date;
  const days = period === "7" ? 6 : 29;
  const dates: Record<string, string> =
    period === "all" ? {} : period === "custom" ? custom : { from: calendarDate(through, -days), through };
  const query = useQuery({
    queryKey: ["seller-promotions", store, account, offer.id, "report", dates, offset],
    queryFn: () => promoRequest<Report>(store, `/${offer.id}/report`, { ...dates, offset: String(offset) }),
    enabled:
      offer.status !== "draft" &&
      offer.status !== "scheduled" &&
      (period !== "custom" || (!!custom.from && !!custom.through)),
    retry: false,
  });
  return (
    <Card className="space-y-3">
      <h2 className="text-title-3">Результаты</h2>
      {offer.status === "draft" ? (
        <p>Результаты появятся после запуска</p>
      ) : offer.status === "scheduled" ? (
        <p>Начало {offer.terms.fromDate}</p>
      ) : (
        <>
          <label className="block">
            Период
            <select
              className="min-h-12 w-full rounded-lg border border-border bg-card px-3"
              value={period}
              onChange={(event) => {
                setPeriod(event.target.value);
                setOffset(0);
              }}
            >
              <option value="all">За всё время</option>
              <option value="7">Последние 7 дней</option>
              <option value="30">Последние 30 дней</option>
              <option value="custom">Свой период</option>
            </select>
          </label>
          {period === "custom" && (
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                label="С"
                value={custom.from}
                onChange={(event) => {
                  setCustom({ ...custom, from: event.target.value });
                  setOffset(0);
                }}
              />
              <Input
                type="date"
                label="По включительно"
                value={custom.through}
                onChange={(event) => {
                  setCustom({ ...custom, through: event.target.value });
                  setOffset(0);
                }}
              />
            </div>
          )}
          {dates.through === through && <p className="text-caption">Сегодня · по сейчас</p>}
          {query.isFetching && <SkeletonBlock className="h-16" />}
          {query.isError && (
            <p>
              Не удалось загрузить результаты{" "}
              <Button variant="secondary" onClick={() => void query.refetch()}>
                Повторить
              </Button>
            </p>
          )}
          {query.data &&
            (query.data.orderCount ? (
              <>
                <ListItem title="Заказы с акцией" value={query.data.orderCount} onClick={() => setDetail(!detail)} />
                <ListItem title="Сумма товаров в этих заказах" value={formatMinor(query.data.itemsMinor, currency)} />
                <ListItem title="Скидка по этой акции" value={formatMinor(query.data.savingsMinor, currency)} />
                <ListItem title="Покупатели" value={query.data.customers} />
                {!!query.data.deliveryMinor && (
                  <ListItem title="Доставка отдельно" value={formatMinor(query.data.deliveryMinor, currency)} />
                )}
                {query.data.thresholdCount > 0 && (
                  <ListItem
                    title="Средняя сумма товаров со скидкой от порога"
                    value={formatMinor(query.data.thresholdAverage ?? 0, currency)}
                  />
                )}
                {query.data.purchaseStats.map((stat) => (
                  <div key={`${stat.mode}:${stat.target}`}>
                    <ListItem
                      title={
                        stat.mode === "from"
                          ? `Воспользовались скидкой с покупки №${stat.target}`
                          : stat.target === 1
                            ? "Сделали первую покупку с акцией"
                            : `Сделали покупку №${stat.target} с акцией`
                      }
                      value={stat.buyers}
                    />
                    {stat.mode === "exact" && stat.target === 1 && (
                      <div className="space-y-1 px-3 text-caption">
                        <p className="text-label">Заказали ещё раз за 30 дней</p>
                        <p>
                          {stat.matured
                            ? `${stat.repeated} из ${stat.matured}`
                            : "Результат появится через 30 дней после первой покупки"}
                        </p>
                        {!!stat.waiting && <p>Ещё у {stat.waiting} покупателей период наблюдения продолжается</p>}
                      </div>
                    )}
                  </div>
                ))}
                {!!query.data.guestOrders && <p>Заказов гостей · {query.data.guestOrders}</p>}
                {detail && (
                  <>
                    {query.data.orders.map((order) => (
                      <ListItem
                        key={order.number}
                        title={`Заказ №${order.number} · ${order.name}`}
                        subtitle={`${shopDateTime(order.completedAt, zone).date} · товары ${formatMinor(order.itemsMinor, currency)}`}
                        value={`−${formatMinor(order.savingMinor, currency)}`}
                        onClick={() => openOrder(order.number)}
                      />
                    ))}
                    {!!offset && (
                      <Button variant="secondary" onClick={() => setOffset(Math.max(0, offset - 30))}>
                        Назад
                      </Button>
                    )}
                    {query.data.nextOffset !== null && (
                      <Button variant="secondary" onClick={() => setOffset(query.data?.nextOffset ?? 0)}>
                        Далее
                      </Button>
                    )}
                  </>
                )}
              </>
            ) : (
              <p>
                {period === "all"
                  ? "Здесь появятся результаты после первого выполненного заказа со скидкой"
                  : "За этот период заказов с акцией нет"}
              </p>
            ))}
        </>
      )}
    </Card>
  );
}
