import { ChevronRight } from "lucide-react";
import { formatMinor } from "../../../../shared/money";
import type { Report } from "./api";

export function Metric({
  title,
  value,
  prominent = false,
}: {
  title: string;
  value: React.ReactNode;
  prominent?: boolean;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${prominent ? "text-title-3" : "text-meta"}`}>
      <span className="min-w-0 wrap-anywhere">{title}</span>
      <span className="shrink-0 text-right tabular-nums">{value}</span>
    </div>
  );
}

export function PromoReportMetrics({
  report,
  currency,
  detail,
  toggle,
}: {
  report: Report;
  currency: string;
  detail: boolean;
  toggle: () => void;
}) {
  return (
    <>
      <button
        type="button"
        aria-expanded={detail}
        onClick={toggle}
        className="flex min-h-11 w-full items-center justify-between gap-3 text-left text-title-3"
      >
        Заказы с акцией
        <span className="flex shrink-0 items-center gap-1">
          {report.orderCount}
          <ChevronRight size={18} aria-hidden="true" className={detail ? "rotate-90" : ""} />
        </span>
      </button>
      <div className="space-y-2 border-t border-border pt-2.5">
        <Metric title="Сумма товаров в этих заказах" value={formatMinor(report.itemsMinor, currency)} />
        <Metric title="Доставка" value={formatMinor(report.deliveryMinor, currency)} />
        <Metric title="Скидка по этой акции" value={formatMinor(report.savingsMinor, currency)} />
        <Metric title="Покупатели" value={report.customers} />
        {!!report.guestOrders && <Metric title="Заказов гостей" value={report.guestOrders} />}
      </div>
      {(report.thresholdCount > 0 || report.purchaseStats.length > 0) && (
        <div className="space-y-2.5 border-t border-border pt-2.5">
          {report.thresholdCount > 0 && (
            <Metric
              title="Средняя сумма товаров со скидкой от порога"
              value={formatMinor(report.thresholdAverage ?? 0, currency)}
            />
          )}
          {report.purchaseStats.map((stat) => (
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
    </>
  );
}
