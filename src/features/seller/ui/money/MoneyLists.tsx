import { ArrowDownLeft, ArrowUpRight, List, Wallet, X } from "lucide-react";
import { type ReactNode, useRef } from "react";
import { QueryBoundary } from "../../../../app/shell/QueryBoundary";
import type { SellerMoneyTask } from "../../../../shared/contracts/seller-money";
import type { SalesPeriod } from "../../../../shared/contracts/seller-sales";
import { defaultShopTimeZone, formatShopTimestamp } from "../../../../shared/datetime";
import { formatMinor } from "../../../../shared/money";
import { Button } from "../../../../ui/Button";
import { EmptyState } from "../../../../ui/EmptyState";
import { IconButton } from "../../../../ui/IconButton";
import { Input } from "../../../../ui/Input";
import { ListItem } from "../../../../ui/ListItem";
import { useMoneyOperations, useMoneyTasks } from "../../money-api";
import { isMoneyForbidden, MoneyAccessRestricted } from "./MoneyAccessRestricted";
import { methods } from "./MoneyOverview";

type Session = { store: string; account: string; timeZone?: string };
export function MoneyTasks({
  session,
  group,
  open,
}: {
  session: Session;
  group: SellerMoneyTask["kind"];
  open: (number: number, receipt?: boolean) => void;
}) {
  const query = useMoneyTasks(session, group);
  if (isMoneyForbidden(query.error)) return <MoneyAccessRestricted />;
  return (
    <QueryBoundary query={query} template="list">
      {({ pages }) => (
        <div className="grid gap-2">
          {!pages[0]?.rows.length && <EmptyState title="Финансовых задач нет" icon={<Wallet size={36} />} />}
          {pages.flatMap(({ rows, currency }) =>
            rows.map((task) => (
              <ListItem
                key={task.id}
                title={`Заказ №${task.number}`}
                subtitle={taskStatus(task)}
                value={formatMinor(task.amountMinor, currency)}
                onClick={() => open(task.number, task.kind === "review")}
              />
            )),
          )}
          {query.hasNextPage && (
            <Button
              full
              variant="secondary"
              loading={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {query.isFetchNextPageError ? "Повторить" : "Показать ещё"}
            </Button>
          )}
        </div>
      )}
    </QueryBoundary>
  );
}

function taskStatus(task: SellerMoneyTask) {
  if (task.kind === "review") return "Проверить чек";
  if (task.kind === "topUp") return "Ждём перевод покупателя";
  return task.detailsReady ? "Реквизиты получены" : task.needsSeller ? "Готов к выплате" : "Ждём реквизиты покупателя";
}

export function MoneyOperations({
  session,
  period,
  choosePeriod,
  method,
  term,
  search,
  open,
}: {
  session: Session;
  period: Partial<SalesPeriod>;
  choosePeriod: ReactNode;
  method?: keyof typeof methods;
  term: string;
  search: (value: string) => void;
  open: (number: number) => void;
}) {
  const field = useRef<HTMLElement>(null);
  const query = useMoneyOperations(session, { ...period, method, search: term.trim() });
  if (isMoneyForbidden(query.error)) return <MoneyAccessRestricted />;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {choosePeriod}
        {method && <p className="text-caption text-muted-foreground">Поступления · {methods[method]}</p>}
      </div>
      <search ref={field} className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
        <Input
          label="Номер заказа или точная сумма"
          autoComplete="off"
          value={term}
          onChange={(event) => search(event.target.value)}
          maxLength={40}
        />
        {term && (
          <IconButton
            aria-label="Очистить поиск"
            onClick={() => {
              search("");
              field.current?.querySelector("input")?.focus();
            }}
          >
            <X size={20} aria-hidden />
          </IconButton>
        )}
      </search>
      <QueryBoundary query={query} template="list">
        {({ pages }) => (
          <div className="grid gap-2">
            {!pages[0]?.rows.length && (
              <EmptyState title={term ? "Ничего не найдено" : "Операций нет"} icon={<List size={36} />} />
            )}
            {pages.flatMap(({ rows, currency }) =>
              rows.map((row) => {
                const received = row.kind === "received";
                const Icon = received ? ArrowUpRight : ArrowDownLeft;
                return (
                  <ListItem
                    key={row.id}
                    title={received ? "Поступление" : "Возврат"}
                    subtitle={`Заказ №${row.number} · ${formatShopTimestamp(row.at, session.timeZone ?? defaultShopTimeZone)}`}
                    icon={
                      <span
                        className={`grid size-10 place-items-center rounded-full ${received ? "bg-status-success text-status-success-foreground" : "bg-secondary"}`}
                      >
                        <Icon size={20} aria-hidden />
                      </span>
                    }
                    value={
                      <span className="whitespace-nowrap font-semibold">
                        {row.amountMinor === null
                          ? "—"
                          : `${received ? "+" : "−"}${formatMinor(row.amountMinor, currency)}`}
                      </span>
                    }
                    onClick={() => open(row.number)}
                  />
                );
              }),
            )}
            {query.hasNextPage && (
              <Button
                full
                variant="secondary"
                loading={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
              >
                {query.isFetchNextPageError ? "Повторить" : "Показать ещё"}
              </Button>
            )}
          </div>
        )}
      </QueryBoundary>
    </>
  );
}
