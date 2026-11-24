import { useId, useState } from "react";
import type { SalesReport, SalesTotals } from "../../../../shared/contracts/seller-sales";
import { shopDateTime } from "../../../../shared/datetime";
import { formatMinor } from "../../../../shared/money";
import { periodLabel } from "./dates";

export const metricLabels = { revenueMinor: "Выручка", orderCount: "Заказы", average: "Средний чек" };
export type Metric = keyof typeof metricLabels;

export function metricValue(data: SalesTotals, metric: Metric) {
  return metric === "average" ? data.averageMinor : data[metric];
}

export function showMetric(value: number | null, metric: Metric, currency: string) {
  if (value === null) return "—";
  return metric === "orderCount" ? value.toLocaleString("ru-RU") : formatMinor(Math.round(value), currency);
}

export function SalesChart({ report, metric }: { report: SalesReport; metric: Metric }) {
  const [selected, select] = useState<number>();
  const gradient = useId();
  const { points } = report;
  const previous = report.previous?.orderCount ? report.previousPoints : [];
  const currentValues = points.map((p) => metricValue(p, metric));
  const previousValues = previous.map((p) => metricValue(p, metric));
  const peak = Math.max(2, ...currentValues.map((value) => value ?? 0), ...previousValues.map((value) => value ?? 0));
  const scale = 10 ** Math.floor(Math.log10(peak));
  const max = Math.ceil(peak / scale) * scale;
  const count = Math.max(points.length, previous.length);
  const width = Math.max(280, count * 44);
  const x = (index: number) => ((index + 0.5) * width) / count;
  const y = (value: number) => 106 - (90 * value) / max;
  const valueText = (value: number | null = null) => showMetric(value, metric, report.currency);
  const label = (p: SalesReport["points"][number], compact = false) =>
    report.unit === "hour"
      ? shopDateTime(Date.parse(p.from), report.timeZone).time
      : compact && p.from === p.to
        ? p.from.slice(5).split("-").reverse().join(".")
        : periodLabel(p);
  const draw = (series: (number | null)[]) =>
    series
      .map((value, i) => (value === null ? "" : `${i === 0 || series[i - 1] === null ? "M" : "L"}${x(i)},${y(value)}`))
      .join(" ");
  const path = draw(currentValues);
  return (
    <fieldset aria-label={`График · ${metricLabels[metric]}`} className="min-w-0 space-y-2">
      {selected !== undefined && (
        <div className="rounded-lg bg-secondary p-3 text-small" role="status">
          <p>
            {points[selected] ? label(points[selected]) : "—"} · <strong>{valueText(currentValues[selected])}</strong>
          </p>
          {previous.length > 0 && (
            <p className="text-muted-foreground">
              {previous[selected] ? label(previous[selected]) : "—"} · {valueText(previousValues[selected])}
            </p>
          )}
        </div>
      )}
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
        <div
          aria-hidden="true"
          className="flex h-28 flex-col justify-between py-2 text-right text-micro text-muted-foreground"
        >
          {[max, Math.round(max / 2), 0].map((value) => (
            <span key={value}>{valueText(value)}</span>
          ))}
        </div>
        <div className="overflow-x-auto overscroll-x-contain">
          <div className="relative" style={{ width: count <= 7 ? "100%" : width }}>
            <svg
              viewBox={`0 0 ${width} 114`}
              preserveAspectRatio="none"
              className="h-28 w-full text-primary"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="currentColor" stopOpacity=".17" />
                  <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[16, 61, 106].map((height) => (
                <path key={height} d={`M0 ${height} H${width}`} stroke="var(--color-border)" />
              ))}
              {path && currentValues.every((value) => value !== null) && (
                <path d={`${path} L${x(points.length - 1)},106 L${x(0)},106 Z`} fill={`url(#${gradient})`} />
              )}
              <path
                d={draw(previousValues)}
                fill="none"
                stroke="var(--color-muted-foreground)"
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />
              <path d={path} fill="none" stroke="currentColor" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
              {selected !== undefined && (
                <path d={`M${x(selected)} 10 V106`} stroke="currentColor" strokeDasharray="3 5" />
              )}
              {currentValues.map(
                (value, i) =>
                  value !== null && (
                    <circle
                      key={points[i].from}
                      cx={x(i)}
                      cy={y(value)}
                      r={selected === i ? 4.5 : 2.75}
                      fill="var(--color-card)"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                  ),
              )}
            </svg>
            <div className="absolute inset-x-0 top-0 flex h-28">
              {Array.from({ length: count }, (_, i) => {
                const point = points[i] ?? previous[i];
                return (
                  <button
                    key={point.from}
                    className="min-h-11 flex-1 rounded-sm"
                    type="button"
                    aria-label={`${label(point)} · ${valueText(currentValues[i])}`}
                    aria-pressed={selected === i}
                    onClick={() => select(i)}
                    onFocus={() => select(i)}
                  />
                );
              })}
            </div>
            <div className="flex text-center text-micro text-muted-foreground" aria-hidden="true">
              {Array.from({ length: count }, (_, i) => (
                <span key={(points[i] ?? previous[i]).from} className="flex-1">
                  {points[i] && (report.unit !== "hour" || i % 2 === 0) ? label(points[i], true) : ""}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
      {!!previous.length && (
        <div className="flex flex-wrap gap-x-4 text-small text-muted-foreground">
          <span>
            <span className="mr-1 inline-block w-4 align-middle border-t-2 border-primary" /> Выбранный период
          </span>
          <span>
            <span className="mr-1 inline-block w-4 align-middle border-t-2 border-dashed border-muted-foreground" />{" "}
            Прошлый период
          </span>
        </div>
      )}
    </fieldset>
  );
}
