import { useNavigate, useRouterState } from "@tanstack/react-router";
import { SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { QueryBoundary } from "../../../../app/shell/QueryBoundary";
import { sellerHistory } from "../../../../app/shell/tab-history";
import type { SellerOrderPage, SellerOrderSummary, SellerOrdersQuery } from "../../../../shared/contracts/seller-order";
import { workdayFocus } from "../../../../shared/contracts/workday";
import { formatShopDay, shopDateTime } from "../../../../shared/datetime";
import { Button } from "../../../../ui/Button";
import { Card } from "../../../../ui/Card";
import { Checkbox } from "../../../../ui/Checkbox";
import { Chip } from "../../../../ui/Chip";
import { EmptyState } from "../../../../ui/EmptyState";
import { IconButton } from "../../../../ui/IconButton";
import { Radio } from "../../../../ui/Radio";
import { SearchField } from "../../../../ui/SearchField";
import { Sheet } from "../../../../ui/Sheet";
import { sellerOrderSearch } from "../../order-search";
import { moreSellerOrders, useSellerOrderCommand, useSellerOrderList } from "../../orders-api";
import { WorkdayDays, workdayLabels } from "../workday/workday-ui";
import { methodLabel, stages } from "./OrderIndicators";
import { OrderListCard } from "./OrderListCard";
import { SellerOrdersShell } from "./SellerOrdersShell";

export function SellerOrdersList() {
  const scope = useRouterState({ select: (state) => state.location.search.back });
  return (
    <SellerOrdersShell title="Заказы">
      {(store) => <OrderList key={`${store}:${scope ?? ""}`} store={store} />}
    </SellerOrdersShell>
  );
}

function OrderList({ store }: { store: string }) {
  const location = useRouterState({ select: (state) => state.location });
  const navigate = useNavigate();
  const day = typeof location.search.day === "string" ? location.search.day : undefined;
  const focus = workdayFocus.safeParse(location.search.focus).data;
  const scoped = !!day || !!focus;
  const [search, setSearch] = useState(() => (scoped ? "" : (sellerOrderSearch.get(store) ?? "")));
  const [settled, setSettled] = useState(search);
  useEffect(() => {
    const timeout = setTimeout(() => setSettled(search), 220);
    return () => clearTimeout(timeout);
  }, [search]);
  function changeSearch(value: string) {
    const text = value.slice(0, 80);
    if (!scoped) {
      if (text) sellerOrderSearch.set(store, text);
      else sellerOrderSearch.delete(store);
    }
    setSearch(text);
  }
  const tab = location.search.tab === "completed" ? "completed" : "active";
  const method =
    location.search.method === "pickup" || location.search.method === "delivery" ? location.search.method : undefined;
  const debt = tab === "completed" && location.search.debt === "1" ? "1" : undefined;
  const selection: Omit<SellerOrdersQuery, "rev" | "cursor"> = {
    tab,
    method,
    debt,
    day,
    focus,
    search: settled.trim(),
  };
  function changeFilters(next: Partial<Omit<SellerOrdersQuery, "cursor" | "rev" | "search">>) {
    void navigate({
      to: "/seller/orders",
      search: { shop: location.search.shop, tab, method, debt, day, focus, back: location.search.back, store, ...next },
      replace: true,
    });
  }
  const list = useSellerOrderList(store, selection);
  const queryKey = JSON.stringify(selection);
  const [extra, setExtra] = useState<{ key: string; page: SellerOrderPage }>();
  const extraPage = extra?.key === queryKey && extra.page.rev === list.data?.rev ? extra.page : undefined;
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState("");
  const [filter, setFilter] = useState<"all" | "pickup" | "delivery">();
  const mutation = useSellerOrderCommand(store);
  const [attempt, setAttempt] = useState<{ number: number; revision: number; key: string }>();
  function open(order: SellerOrderSummary, action?: "next" | "packing") {
    sellerHistory.savePosition(location.href, window.scrollY);
    void navigate({
      to: "/seller/orders/$number",
      params: { number: String(order.number) },
      search: { shop: location.search.shop, store, action },
    });
  }
  function next(order: SellerOrderSummary) {
    if (order.stage !== "placed") return open(order, order.stage === "accepted" ? "packing" : "next");
    const current =
      attempt?.number === order.number && attempt.revision === order.revision
        ? attempt
        : { number: order.number, revision: order.revision, key: crypto.randomUUID() };
    setAttempt(current);
    mutation.mutate({
      number: order.number,
      key: current.key,
      command: { action: "accept", expectedRevision: order.revision },
    });
  }
  const reset = () => changeFilters({ method: undefined, debt: undefined, day: undefined, focus: undefined });
  return (
    <>
      {scoped ? (
        <fieldset className="flex flex-wrap gap-2" aria-label="Применённые фильтры">
          {day && (
            <Chip selected onClick={() => changeFilters({ day: undefined })}>
              {formatShopDay(day, list.data?.timeZone ?? "UTC")}
            </Chip>
          )}
          {focus && (
            <Chip selected onClick={() => changeFilters({ focus: undefined })}>
              {workdayLabels[focus]}
            </Chip>
          )}
          <Button variant="ghost" onClick={reset}>
            Сбросить фильтры
          </Button>
        </fieldset>
      ) : (
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-card p-1">
          <Chip selected={tab === "active"} onClick={() => changeFilters({ tab: "active", debt: undefined })}>
            В работе{list.data ? ` · ${list.data.active}` : ""}
          </Chip>
          <Chip selected={tab === "completed"} onClick={() => changeFilters({ tab: "completed" })}>
            Завершённые
          </Chip>
        </div>
      )}
      {day && list.data && (
        <WorkdayDays
          day={day}
          today={shopDateTime(Date.now(), list.data.timeZone).date}
          select={(nextDay) => changeFilters({ day: nextDay })}
          calendar={() =>
            void navigate({
              to: "/seller/workday/calendar",
              search: { store, day, month: day.slice(0, 7), purpose: "orders", back: location.href },
            })
          }
        />
      )}
      <div className="space-y-1 rounded-xl bg-card p-2">
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1">
            <SearchField label="Номер, имя или телефон" value={search} onChange={changeSearch} />
          </div>
          <IconButton aria-label="Фильтры" badge={method ? 1 : undefined} onClick={() => setFilter(method ?? "all")}>
            <SlidersHorizontal size={20} aria-hidden="true" />
          </IconButton>
        </div>
        {tab === "completed" && (
          <Checkbox
            label="Только с долгом"
            checked={!!debt}
            onChange={(e) => changeFilters({ debt: e.target.checked ? "1" : undefined })}
          />
        )}
      </div>
      {mutation.error && <p role="alert">{mutation.error.message}</p>}
      <QueryBoundary query={list} template="list">
        {(page) => {
          const orders = extraPage ? [...page.orders, ...extraPage.orders] : page.orders;
          const cursor = extraPage ? extraPage.cursor : page.cursor;
          const groups = groupOrders(orders, tab, page.timeZone);
          return (
            <>
              {!orders.length && (
                <Card>
                  <EmptyState
                    title={
                      settled
                        ? "Ничего не найдено"
                        : method || debt || focus
                          ? "По этим фильтрам заказов нет"
                          : day
                            ? "На этот день заказов нет"
                            : tab === "active"
                              ? "Заказов в работе пока нет"
                              : "Завершённых заказов пока нет"
                    }
                    action={settled ? "Очистить поиск" : method || debt || scoped ? "Сбросить фильтры" : undefined}
                    onAction={settled ? () => changeSearch("") : reset}
                  />
                </Card>
              )}
              {Array.from(groups, ([key, rows]) => {
                const stage = stages[rows[0].stage];
                const Icon = stage.Icon;
                return (
                  <section key={key} aria-labelledby={`orders-group-${key}`} className="space-y-2">
                    <h2 id={`orders-group-${key}`} className="flex items-center gap-2 px-1 pt-2 text-label">
                      {tab === "active" ? (
                        <>
                          <Icon size={18} aria-hidden="true" />
                          {stage.section} · {page.counts[rows[0].stage]}
                        </>
                      ) : (
                        formatShopDay(key, page.timeZone)
                      )}
                    </h2>
                    {rows.map((order) => (
                      <OrderListCard
                        key={order.number}
                        order={order}
                        timeZone={page.timeZone}
                        pending={mutation.isPending && mutation.variables?.number === order.number}
                        open={() => open(order)}
                        next={() => next(order)}
                      />
                    ))}
                  </section>
                );
              })}
              {moreError && <p role="alert">{moreError}</p>}
              {cursor && (
                <Button
                  full
                  variant="secondary"
                  loading={loadingMore}
                  onClick={() => {
                    setLoadingMore(true);
                    setMoreError("");
                    void moreSellerOrders(store, selection, cursor)
                      .then((nextPage) =>
                        setExtra({
                          key: queryKey,
                          page: { ...nextPage, orders: [...(extraPage?.orders ?? []), ...nextPage.orders] },
                        }),
                      )
                      .catch((error: Error) => {
                        setMoreError(error.message);
                        void list.refetch();
                      })
                      .finally(() => setLoadingMore(false));
                  }}
                >
                  {moreError ? "Повторить" : "Показать ещё"}
                </Button>
              )}
            </>
          );
        }}
      </QueryBoundary>
      {filter && (
        <Sheet
          open
          title="Фильтры"
          onOpenChange={(open) => {
            if (!open) setFilter(undefined);
          }}
        >
          {(["all", "delivery", "pickup"] as const).map((mode) => (
            <Radio
              key={mode}
              name="receiving-filter"
              label={mode === "all" ? "Все способы" : methodLabel[mode]}
              checked={filter === mode}
              onChange={() => setFilter(mode)}
            />
          ))}
          <Button
            full
            onClick={() => {
              changeFilters({ method: filter === "all" ? undefined : filter });
              setFilter(undefined);
            }}
          >
            Применить
          </Button>
          <Button
            full
            variant="ghost"
            onClick={() => {
              reset();
              setFilter(undefined);
            }}
          >
            Сбросить фильтры
          </Button>
        </Sheet>
      )}
    </>
  );
}

function groupOrders(orders: SellerOrderSummary[], tab: "active" | "completed", timeZone: string) {
  const groups = new Map<string, SellerOrderSummary[]>();
  for (const order of orders) {
    const key =
      tab === "active" ? order.stage : order.receivingAt.slice(0, 10) || shopDateTime(order.createdAt, timeZone).date;
    const rows = groups.get(key);
    if (rows) rows.push(order);
    else groups.set(key, [order]);
  }
  return groups;
}
