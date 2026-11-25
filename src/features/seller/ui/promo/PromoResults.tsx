import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { PromoOffer } from "../../../../shared/contracts/promo";
import { calendarDate, shopDateTime } from "../../../../shared/datetime";
import { errorKind } from "../../../../shared/http-error";
import { formatMinor } from "../../../../shared/money";
import { Button } from "../../../../ui/Button";
import { Card } from "../../../../ui/Card";
import { Input } from "../../../../ui/Input";
import { ListItem } from "../../../../ui/ListItem";
import { SelectField } from "../../../../ui/SelectField";
import { SkeletonBlock } from "../../../../ui/SkeletonBlock";
import { promoRequest, type Report } from "./api";
import { clearReportFilters, useReportFilters } from "./filter-state";

type Props = {
  offer: PromoOffer;
  store: string;
  account: string;
  currency: string;
  zone: string;
  openOrder: (number: number) => void;
};

const periodOptions = [
  ["all", "За всё время"],
  ["7", "Последние 7 дней"],
  ["30", "Последние 30 дней"],
  ["custom", "Свой период"],
] as const;

function Metric({ title, value, prominent = false }: { title: string; value: React.ReactNode; prominent?: boolean }) {
  return (
    <div className={`flex items-start justify-between gap-3 ${prominent ? "text-title-3" : "text-body"}`}>
      <span className="min-w-0 wrap-anywhere">{title}</span>
      <span className="shrink-0 text-right tabular-nums">{value}</span>
    </div>
  );
}

export function PromoResults(props: Props) {
  const [denied, setDenied] = useState(false);
  const closeReport = useCallback(() => setDenied(true), []);
  if (denied) return <Card role="alert">Доступ к результатам ограничен</Card>;
  return <PromoReport {...props} onDenied={closeReport} />;
}

function PromoReport({ offer, store, account, currency, zone, openOrder, onDenied }: Props & { onDenied: () => void }) {
  const { period, setPeriod, custom, setCustom, offset, setOffset, detail, setDetail } = useReportFilters(
    store,
    account,
    offer.id,
  );
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
    // Do not reuse a report from a different period or a previous visit without a new access check.
    gcTime: 0,
    refetchOnWindowFocus: "always",
  });
  const denied = errorKind(query.error) === "access";
  useEffect(() => {
    if (!denied) return;
    clearReportFilters(store, account, offer.id);
    onDenied();
  }, [denied, onDenied, store, account, offer.id]);
  if (denied) return null;
  return (
    <Card className="space-y-3">
      <h2 className="text-title-2">Результаты</h2>
      {offer.status === "draft" ? (
        <p>Результаты появятся после запуска</p>
      ) : offer.status === "scheduled" ? (
        <p>Начало {offer.terms.fromDate}</p>
      ) : (
        <>
          <SelectField
            aria-label="Период"
            caption={periodOptions.find(([key]) => key === period)?.[1]}
            icon={<CalendarDays size={16} />}
            value={period}
            onChange={(event) => {
              setPeriod(event.target.value);
              setOffset(0);
            }}
          >
            {periodOptions.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </SelectField>
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
          {!query.isError &&
            query.data &&
            (query.data.orderCount ? (
              <>
                <button
                  type="button"
                  aria-expanded={detail}
                  onClick={() => setDetail(!detail)}
                  className="flex min-h-11 w-full items-center justify-between gap-3 text-left text-title-3"
                >
                  Заказы с акцией
                  <span className="flex shrink-0 items-center gap-2">
                    {query.data.orderCount}
                    <ChevronRight size={16} aria-hidden="true" className={detail ? "rotate-90" : ""} />
                  </span>
                </button>
                <div className="space-y-2 border-t border-border pt-2.5">
                  <Metric title="Сумма товаров в этих заказах" value={formatMinor(query.data.itemsMinor, currency)} />
                  <Metric title="Доставка" value={formatMinor(query.data.deliveryMinor, currency)} />
                  <Metric title="Скидка по этой акции" value={formatMinor(query.data.savingsMinor, currency)} />
                  <Metric title="Покупатели" value={query.data.customers} />
                  {!!query.data.guestOrders && <Metric title="Заказов гостей" value={query.data.guestOrders} />}
                </div>
                {(query.data.thresholdCount > 0 || query.data.purchaseStats.length > 0) && (
                  <div className="space-y-2.5 border-t border-border pt-2.5">
                    {query.data.thresholdCount > 0 && (
                      <Metric
                        title="Средняя сумма товаров со скидкой от порога"
                        value={formatMinor(query.data.thresholdAverage ?? 0, currency)}
                      />
                    )}
                    {query.data.purchaseStats.map((stat) => (
                      <div className="space-y-2.5" key={`${stat.mode}:${stat.target}`}>
                        <Metric
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
                          <>
                            <Metric
                              title="Заказали ещё раз за 30 дней"
                              value={stat.matured ? `${stat.repeated} из ${stat.matured}` : "—"}
                              prominent
                            />
                            {!stat.matured && (
                              <p className="text-small text-muted-foreground">
                                Результат появится через 30 дней после первой покупки
                              </p>
                            )}
                            {!!stat.waiting && (
                              <p className="text-small text-muted-foreground">
                                Ещё у {stat.waiting} покупателей период наблюдения продолжается
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
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
              <>
                <Metric title="Заказы с акцией" value={0} prominent />
                <p className="text-small text-muted-foreground">
                  {period === "all"
                    ? "Здесь появятся результаты после первого выполненного заказа со скидкой"
                    : "За этот период заказов с акцией нет"}
                </p>
              </>
            ))}
        </>
      )}
    </Card>
  );
}
