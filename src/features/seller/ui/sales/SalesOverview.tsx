import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { sellerHistory } from "../../../../app/shell/tab-history";
import type { SalesPeriod, SalesReport } from "../../../../shared/contracts/seller-sales";
import { defaultShopTimeZone } from "../../../../shared/datetime";
import { Card } from "../../../../ui/Card";
import { EmptyState } from "../../../../ui/EmptyState";
import { Switch } from "../../../../ui/Switch";
import { noSalesAccess, type SalesSession, useSalesDays, useSalesReport } from "../../sales-api";
import { periodLabel, periodPreset } from "./dates";
import { PeriodPicker } from "./PeriodPicker";
import { type Metric, metricLabels, metricValue, SalesChart, showMetric } from "./SalesChart";
import { RankPreview, SalesQuery } from "./SalesProducts";

export function SalesOverview({ session }: { session: SalesSession }) {
  const { search } = useRouterState({ select: (state) => state.location });
  const navigate = useNavigate();
  const [metric, setMetric] = useState<Metric>("revenueMinor");
  const [showDays, setShowDays] = useState(false);
  const averageDescription = useId();
  const compare = search.compare !== "0";
  const period = search.from && search.to ? { from: search.from, to: search.to } : {};
  const report = useSalesReport(session, period, compare);
  if (noSalesAccess(report.error)) return <EmptyState title="Доступ ограничен" />;
  const zone = report.data?.timeZone ?? session.timeZone ?? defaultShopTimeZone;
  const dates = report.data?.period ?? (period.from ? period : periodPreset(zone, 7, true));
  const unit =
    report.data && { hour: "По часам", day: "По дням", week: "По неделям", month: "По месяцам" }[report.data.unit];
  const compareControl = (
    <Switch
      label="Сравнить с прошлым периодом"
      checked={compare}
      onChange={(event) => apply(period, event.target.checked)}
    />
  );
  const apply = (next: Partial<SalesPeriod>, showComparison = compare) =>
    void navigate({
      to: "/seller/statistics",
      search: { ...search, store: session.store, ...next, compare: showComparison ? undefined : "0" },
      replace: true,
      resetScroll: false,
    });
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <PeriodPicker period={dates} timeZone={zone} completedWeek apply={apply} />
      </div>
      {!report.data && <Card>{compareControl}</Card>}
      <SalesQuery query={report} title="Не удалось загрузить график">
        {(data) => (
          <Card>
            <fieldset
              aria-label="Показатели продаж"
              className="grid grid-cols-3 items-stretch gap-1 rounded-lg bg-secondary p-1"
            >
              {(Object.keys(metricLabels) as Metric[]).map((name) => (
                <button
                  type="button"
                  key={name}
                  onClick={() => setMetric(name)}
                  aria-pressed={metric === name}
                  aria-describedby={name === "average" ? averageDescription : undefined}
                  className={`flex min-h-16 min-w-0 flex-col gap-1 rounded-md px-2 py-1.5 text-left ${metric === name ? "bg-card ring-1 ring-primary" : ""}`}
                >
                  <span className="text-small text-muted-foreground">{metricLabels[name]}</span>
                  <strong className="break-words text-title-3 tabular-nums">
                    {showMetric(metricValue(data.current, name), name, data.currency)}
                  </strong>
                  <Comparison report={data} metric={name} />
                </button>
              ))}
            </fieldset>
            <p id={averageDescription} className="text-small text-muted-foreground">
              По заказам с положительной суммой после возвратов
            </p>
            <div className="border-t border-border">{compareControl}</div>
            {data.current.orderCount === 0 && !data.current.incomplete ? (
              <EmptyState title="Нет продаж" />
            ) : (
              <>
                <p className="text-small text-muted-foreground">{unit}</p>
                <SalesChart
                  key={`${data.period.from}:${data.period.to}:${metric}:${compare}`}
                  report={data}
                  metric={metric}
                />
              </>
            )}
            {data.current.incomplete || data.previous?.incomplete ? (
              <p className="text-small text-muted-foreground">Данные за период неполные</p>
            ) : compare && data.previous && !data.previous.orderCount ? (
              <p className="text-small text-muted-foreground">Нет данных для сравнения</p>
            ) : compare && data.previous ? (
              <SalesComparison report={data} />
            ) : null}
          </Card>
        )}
      </SalesQuery>
      <RankPreview session={session} period={period.from ? period : (report.data?.period ?? {})} />
      <Card className="!p-0">
        <button
          className="flex min-h-12 w-full items-center justify-between rounded-xl px-4 text-label"
          type="button"
          onClick={() => setShowDays(!showDays)}
          aria-expanded={showDays}
        >
          Данные по дням <ChevronDown size={20} className={showDays ? "rotate-180" : undefined} aria-hidden="true" />
        </button>
        {showDays && <DayTable session={session} period={dates} />}
      </Card>
      {session.orders && (metric === "revenueMinor" || metric === "orderCount") && (
        <Card className="!py-0">
          <CompletedOrders session={session} period={dates} />
        </Card>
      )}
    </>
  );
}

function Comparison({ report, metric }: { report: SalesReport; metric: Metric }) {
  const change = report.changes?.[metric];
  if (change === undefined || change === null) return null;
  return (
    <span
      className={`text-small font-semibold ${change < 0 ? "text-status-danger-foreground" : "text-status-success-foreground"}`}
    >
      {change > 0 ? "+" : ""}
      {change} %
    </span>
  );
}

function SalesComparison({ report }: { report: SalesReport }) {
  const { current, previous, currency } = report;
  if (!previous) return null;
  const delta = report.revenueDifference;
  if (delta === null) return null;
  const revenue =
    delta === 0
      ? "Выручка не изменилась"
      : `Выручка ${delta > 0 ? "выросла" : "снизилась"} на ${showMetric(Math.abs(delta), "revenueMinor", currency)}`;
  const average = showMetric(metricValue(current, "average"), "average", currency);
  const before = showMetric(metricValue(previous, "average"), "average", currency);
  const orders =
    current.orderCount === previous.orderCount
      ? `Число заказов не изменилось — ${current.orderCount}`
      : `Заказов стало ${current.orderCount} вместо ${previous.orderCount}`;
  const check = average === before ? `средний чек остался ${average}` : `средний чек — ${average} вместо ${before}`;
  return (
    <p className="text-small">
      {revenue}. {orders}, {check}.
    </p>
  );
}

function DayTable({ session, period }: { session: SalesSession; period: SalesPeriod }) {
  const query = useSalesDays(session, period, true);
  return (
    <SalesQuery query={query} title="Не удалось загрузить данные по дням">
      {({ rows, currency }) => (
        <div className="max-h-64 overflow-auto px-4 pb-3">
          <table aria-label="Данные по дням" className="w-full border-collapse text-small tabular-nums [&_td]:py-2">
            <thead className="sticky top-0 bg-card text-muted-foreground">
              <tr>
                <th scope="col" className="text-left">
                  День
                </th>
                <th scope="col">Выручка</th>
                <th scope="col">Заказы</th>
                <th scope="col">Средний чек</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.from} className="border-t border-border text-right">
                  <th scope="row" className="text-left font-normal">
                    {periodLabel(row)}
                  </th>
                  <td>{showMetric(row.revenueMinor, "revenueMinor", currency)}</td>
                  <td>{row.orderCount}</td>
                  <td>{showMetric(row.averageMinor, "average", currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SalesQuery>
  );
}

function CompletedOrders({ session, period }: { session: SalesSession; period: SalesPeriod }) {
  const href = useRouterState({ select: (state) => state.location.href });
  return (
    <Link
      to="/seller/orders"
      search={(previous) => ({
        shop: previous.shop,
        store: session.store,
        tab: "completed",
        completedFrom: period.from,
        completedTo: period.to,
        back: href,
      })}
      onClick={() => sellerHistory.savePosition(href, window.scrollY)}
      className="flex min-h-11 items-center font-semibold text-primary-text"
    >
      Выполненные заказы
    </Link>
  );
}
