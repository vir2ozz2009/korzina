import { useQuery } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PromoOffer } from "../../../../shared/contracts/promo";
import { calendarDate, shopDateTime } from "../../../../shared/datetime";
import { errorKind } from "../../../../shared/http-error";
import { formatMinor } from "../../../../shared/money";
import { Button } from "../../../../ui/Button";
import { Card } from "../../../../ui/Card";
import { Input } from "../../../../ui/Input";
import { ListItem } from "../../../../ui/ListItem";
import { Sheet } from "../../../../ui/Sheet";
import { SkeletonBlock } from "../../../../ui/SkeletonBlock";
import { promoRequest, type Report } from "./api";
import { clearReportFilters, useReportFilters } from "./filter-state";
import { Metric, PromoReportMetrics } from "./PromoReportMetrics";

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
  const [periodOpen, setPeriodOpen] = useState(false);
  const periodTrigger = useRef<HTMLButtonElement>(null);
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
          <Button
            full
            variant="secondary"
            ref={periodTrigger}
            icon={<CalendarDays size={16} aria-hidden="true" />}
            aria-haspopup="dialog"
            onClick={() => setPeriodOpen(true)}
          >
            {periodOptions.find(([key]) => key === period)?.[1] ?? "За всё время"}
          </Button>
          <Sheet open={periodOpen} title="Период" onOpenChange={setPeriodOpen} returnFocus={periodTrigger}>
            <div className="space-y-2">
              {periodOptions.map(([key, label]) => (
                <Button
                  key={key}
                  full
                  variant={key === period ? "soft" : "secondary"}
                  aria-pressed={key === period}
                  onClick={() => {
                    setPeriod(key);
                    setPeriodOpen(false);
                  }}
                >
                  {label}
                </Button>
              ))}
            </div>
          </Sheet>
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
          {dates.from && dates.through && dates.from <= dates.through && (
            <div className="text-caption text-muted-foreground">
              <p>
                {dates.from.split("-").reverse().join(".")} — {dates.through.split("-").reverse().join(".")}
              </p>
              {dates.through === through && <p>За сегодня — по текущий момент</p>}
            </div>
          )}
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
                <PromoReportMetrics
                  report={query.data}
                  currency={currency}
                  detail={detail}
                  toggle={() => setDetail(!detail)}
                />
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
                <p className="text-meta text-muted-foreground">
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
