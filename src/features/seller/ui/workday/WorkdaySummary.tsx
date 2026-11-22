import { useNavigate, useRouterState } from "@tanstack/react-router";
import { CalendarDays, CircleCheck, PackageCheck } from "lucide-react";
import { QueryBoundary } from "../../../../app/shell/QueryBoundary";
import { sellerHistory } from "../../../../app/shell/tab-history";
import { type WorkdayFocus, workdayActions, workdayStages } from "../../../../shared/contracts/workday";
import { formatMinor } from "../../../../shared/money";
import { Button } from "../../../../ui/Button";
import { ListItem } from "../../../../ui/ListItem";
import { StatusPill } from "../../../../ui/StatusPill";
import { useSellerWorkday } from "../../orders-api";

import { orderCount, workdayLabels } from "./workday-ui";

export function WorkdaySummary({ store, money, assembly }: { store: string; money: boolean; assembly: boolean }) {
  const query = useSellerWorkday(store, money);
  const navigate = useNavigate();
  const current = useRouterState({ select: (state) => state.location.href });
  function go(action: () => void) {
    sellerHistory.savePosition(current, window.scrollY);
    action();
  }
  const openOrders = (day?: string, focus?: WorkdayFocus) =>
    go(
      () =>
        void navigate({
          to: "/seller/orders",
          search: { store, day, focus, back: current },
        }),
    );
  const openPacking = (day: string, window?: string) =>
    go(
      () =>
        void navigate({
          to: "/seller/workday/packing",
          search: { store, day, view: "time", window },
        }),
    );
  return (
    <QueryBoundary query={query} template="list">
      {(data) => {
        const urgent = workdayActions.filter((action) => (data.actions[action] ?? 0) > 0);
        return (
          <>
            <ListItem
              title="Сегодня"
              value={
                <b>
                  {orderCount(data.count)}
                  {money &&
                    data.totalMinor !== undefined &&
                    ` · ${formatMinor(data.totalMinor, data.currency || "VND")}`}
                </b>
              }
              onClick={() => openOrders(data.day)}
            />
            <section className="space-y-2">
              <h2 className="px-1 text-title-3">По этапам</h2>
              <div className="grid grid-cols-2 gap-2">
                {workdayStages.map((stage) => (
                  <ListItem
                    key={stage}
                    title={workdayLabels[stage]}
                    value={<b className="text-title-3 tabular-nums">{data.stages[stage]}</b>}
                    onClick={() => openOrders(data.day, stage)}
                  />
                ))}
              </div>
            </section>
            {assembly && data.upcoming && (
              <ListItem
                title={`Ближайшие: к ${data.upcoming.window.slice(0, 5).replace(/^0/u, "")} · ${orderCount(data.upcoming.count)}`}
                onClick={() => openPacking(data.day, data.upcoming?.window)}
              />
            )}
            {urgent.length ? (
              <section className="rounded-xl bg-card px-1.5 py-2">
                <h2 className="px-2 pt-1 text-title-3">Требуют действия</h2>
                {urgent.map((action) => (
                  <ListItem
                    key={action}
                    title={workdayLabels[action]}
                    value={
                      action === "overdue" ? (
                        <StatusPill tone="danger">{data.actions[action]}</StatusPill>
                      ) : (
                        <b>{data.actions[action]}</b>
                      )
                    }
                    onClick={() => openOrders(action === "accept" ? data.day : undefined, action)}
                  />
                ))}
              </section>
            ) : (
              <ListItem
                title="Срочных дел нет"
                icon={
                  <StatusPill tone="success">
                    <CircleCheck size={16} aria-hidden />
                  </StatusPill>
                }
              />
            )}
            {money && !!data.debtMinor && (
              <ListItem
                title="Долги клиентов"
                value={<b>{formatMinor(data.debtMinor, data.currency || "VND")}</b>}
                onClick={() => openOrders(undefined, "debt")}
              />
            )}
            <div className="flex flex-wrap gap-2">
              {assembly && (
                <Button
                  variant="secondary"
                  icon={<PackageCheck size={18} aria-hidden />}
                  onClick={() => openPacking(data.day)}
                >
                  Список сборки
                </Button>
              )}
              <Button
                variant="secondary"
                icon={<CalendarDays size={18} aria-hidden />}
                onClick={() =>
                  go(
                    () =>
                      void navigate({
                        to: "/seller/workday/calendar",
                        search: { store, day: data.day, month: data.day.slice(0, 7) },
                      }),
                  )
                }
              >
                Календарь
              </Button>
            </div>
          </>
        );
      }}
    </QueryBoundary>
  );
}
