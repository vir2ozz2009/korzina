import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { QueryBoundary } from "../../../../app/shell/QueryBoundary";
import { sellerHistory } from "../../../../app/shell/tab-history";
import type { SellerPackingList, SellerPackingRow } from "../../../../shared/contracts/workday";
import { formatInterval } from "../../../../shared/datetime";
import { Card } from "../../../../ui/Card";
import { Chip } from "../../../../ui/Chip";
import { EmptyState } from "../../../../ui/EmptyState";
import { IconButton } from "../../../../ui/IconButton";
import { ListItem } from "../../../../ui/ListItem";
import { Sheet } from "../../../../ui/Sheet";
import { StatusPill } from "../../../../ui/StatusPill";
import { useSellerCalendar, useSellerPacking } from "../../orders-api";
import { SellerOrdersShell } from "../orders/SellerOrdersShell";
import { orderCount, WorkdayDays } from "./workday-ui";

const dateLabel = new Intl.DateTimeFormat("ru", { day: "numeric", month: "long", timeZone: "UTC" });
const monthLabel = new Intl.DateTimeFormat("ru", { month: "long", year: "numeric", timeZone: "UTC" });
const formattedDay = (day: string) => dateLabel.format(new Date(`${day}T12:00:00Z`));
const windowLabel = (window: string) => formatInterval(window).replace(/(^|–)0/gu, "$1");

export function PackingScreen() {
  return (
    <SellerOrdersShell title="Список сборки">{(store) => <PackingQuery key={store} store={store} />}</SellerOrdersShell>
  );
}

function PackingQuery({ store }: { store: string }) {
  const day = useRouterState({ select: (state) => state.location.search.day });
  const query = useSellerPacking(store, day);
  return (
    <QueryBoundary query={query} template="list">
      {(data) => <Packing key={data.day} store={store} data={data} />}
    </QueryBoundary>
  );
}

function totalRows(windows: SellerPackingList["windows"]) {
  const sum = new Map<string, SellerPackingRow>();
  for (const { rows } of windows)
    for (const row of rows) {
      const key = JSON.stringify([row.productId, row.variantId]);
      const total = sum.get(key);
      sum.set(
        key,
        total ? { ...total, quantity: total.quantity + row.quantity, orders: [...total.orders, ...row.orders] } : row,
      );
    }
  return [...sum.values()];
}

function Packing({ store, data }: { store: string; data: SellerPackingList }) {
  const location = useRouterState({ select: (state) => state.location });
  const navigate = useNavigate();
  const { day, today, windows, hasTimes } = data;
  const view = location.search.view === "day" ? "day" : "time";
  const windowId = location.search.window;
  const anchored = useRef<string>(undefined);
  const [row, setRow] = useState<SellerPackingRow>();
  useEffect(() => {
    if (view !== "time" || !windowId || anchored.current === location.href || sellerHistory.position(location.href) > 0)
      return;
    const frame = requestAnimationFrame(() => {
      anchored.current = location.href;
      document.getElementById(`packing-${windowId}`)?.scrollIntoView({ block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [view, windowId, location.href]);

  const select = (next: { day?: string; view?: "time" | "day" }) =>
    void navigate({
      to: "/seller/workday/packing",
      search: { store, day, view, ...next },
      replace: true,
    });
  const rows = (items: SellerPackingRow[]) => (
    <Card className="space-y-0 p-1">
      {items.map((item) => (
        <ListItem
          key={JSON.stringify([item.productId, item.variantId])}
          title={item.name}
          subtitle={item.variant}
          value={
            <span className="flex items-center gap-2">
              <b>{item.quantity} шт.</b>
              <ChevronRight size={18} aria-hidden />
            </span>
          }
          onClick={() => setRow(item)}
        />
      ))}
    </Card>
  );
  return (
    <>
      <WorkdayDays
        day={day}
        today={today}
        select={(next) => select({ day: next })}
        calendar={() =>
          void navigate({
            to: "/seller/workday/calendar",
            search: { store, day, month: day.slice(0, 7), view, purpose: "packing", back: location.href },
          })
        }
      />
      <h2 className="text-title-3">{formattedDay(day)}</h2>
      {hasTimes && (
        <fieldset className="flex gap-2" aria-label="Вид списка сборки">
          <Chip selected={view === "time"} onClick={() => select({ view: "time" })}>
            По времени
          </Chip>
          <Chip selected={view === "day"} onClick={() => select({ view: "day" })}>
            Весь день
          </Chip>
        </fieldset>
      )}
      {!windows.length ? (
        <Card>
          <EmptyState title="На этот день собирать нечего" />
        </Card>
      ) : view === "day" || !hasTimes ? (
        rows(totalRows(windows))
      ) : (
        windows.map((entry) => (
          <section key={entry.id} id={`packing-${entry.id}`} className="scroll-mt-(--screen-header-height) space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-title-3">
                {entry.id ? `К ${windowLabel(entry.id)} · ${orderCount(entry.count)}` : "Без времени"}
              </h3>
              {entry.passed && <StatusPill tone="warning">время прошло</StatusPill>}
            </div>
            {rows(entry.rows)}
          </section>
        ))
      )}
      {row && (
        <Sheet
          open
          onOpenChange={(open) => {
            if (!open) setRow(undefined);
          }}
          title={`${row.name} · ${row.variant} — ${row.quantity} шт.`}
        >
          {row.orders.map((order) => (
            <ListItem
              key={order.number}
              title={[
                `№${order.number}`,
                `${order.quantity} шт`,
                order.window && `к ${windowLabel(order.window)}`,
                order.name ?? "Имя не указано",
              ]
                .filter(Boolean)
                .join(" · ")}
              onClick={() => {
                sellerHistory.savePosition(location.href, window.scrollY);
                setRow(undefined);
                void navigate({
                  to: "/seller/orders/$number",
                  params: { number: String(order.number) },
                  search: { store, back: location.href },
                });
              }}
            />
          ))}
        </Sheet>
      )}
    </>
  );
}

export function OrderCalendarScreen() {
  return (
    <SellerOrdersShell title="Календарь">{(store) => <CalendarQuery key={store} store={store} />}</SellerOrdersShell>
  );
}

function CalendarQuery({ store }: { store: string }) {
  const location = useRouterState({ select: (state) => state.location });
  const navigate = useNavigate();
  const query = useSellerCalendar(store, location.search.month);
  return (
    <QueryBoundary query={query} template="list">
      {({ month, today, counts }) => {
        const first = new Date(`${month}-01T12:00:00Z`);
        const offset = (first.getUTCDay() + 6) % 7;
        const selected = location.search.day ?? today;
        const changeMonth = (step: number) => {
          const next = new Date(first);
          next.setUTCMonth(next.getUTCMonth() + step);
          void navigate({
            to: "/seller/workday/calendar",
            search: { ...location.search, store, day: selected, month: next.toISOString().slice(0, 7) },
            replace: true,
          });
        };
        function choose(day: string) {
          sellerHistory.savePosition(location.href, window.scrollY);
          if (location.search.purpose === "orders" && location.search.back) {
            const target = new URL(location.search.back, window.location.origin);
            if (target.pathname === "/seller/orders") {
              target.searchParams.set("day", day);
              void navigate({ href: target.pathname + target.search, replace: true });
              return;
            }
          }
          if (location.search.purpose === "packing") {
            void navigate({
              to: "/seller/workday/packing",
              search: { store, day, view: location.search.view },
              replace: true,
            });
          } else {
            const back = `/seller/workday/calendar?${new URLSearchParams({ store, day, month, ...(location.search.back ? { back: location.search.back } : {}) })}`;
            void navigate({ to: "/seller/orders", search: { store, day, back } });
          }
        }
        return (
          <Card>
            <div className="flex items-center justify-between">
              <IconButton aria-label="Предыдущий месяц" onClick={() => changeMonth(-1)}>
                <ChevronLeft size={20} aria-hidden />
              </IconButton>
              <h2 className="text-label first-letter:uppercase" aria-live="polite">
                {monthLabel.format(first)}
              </h2>
              <IconButton aria-label="Следующий месяц" onClick={() => changeMonth(1)}>
                <ChevronRight size={20} aria-hidden />
              </IconButton>
            </div>
            <div className="grid grid-cols-7 text-center">
              {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => (
                <span key={day} className="pb-2 text-small">
                  {day}
                </span>
              ))}
              {["mon", "tue", "wed", "thu", "fri", "sat"].slice(0, offset).map((day) => (
                <span key={day} />
              ))}
              {Object.entries(counts)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([day, count]) => (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={day === selected}
                    aria-label={`${formattedDay(day)}, ${orderCount(count)}`}
                    onClick={() => choose(day)}
                    className={`flex min-h-12 flex-col items-center justify-center rounded-lg text-label ${day === selected ? "bg-primary-soft text-primary-text" : ""}`}
                  >
                    <span>{Number(day.slice(-2))}</span>
                    <span className="text-micro text-muted-foreground">{count}</span>
                  </button>
                ))}
            </div>
          </Card>
        );
      }}
    </QueryBoundary>
  );
}
