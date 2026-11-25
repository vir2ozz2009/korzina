import { ArrowDownLeft, ChevronDown, ChevronRight, Clock3, FileCheck2, List } from "lucide-react";
import { type ReactNode, useState } from "react";
import { QueryBoundary, type QueryResult } from "../../../../app/shell/QueryBoundary";
import type { SellerMoneyOverview, SellerMoneyTask } from "../../../../shared/contracts/seller-money";
import { errorKind } from "../../../../shared/http-error";
import { formatMinor } from "../../../../shared/money";
import { Card } from "../../../../ui/Card";
import { ListItem } from "../../../../ui/ListItem";

export const methods = { transfer: "Переводом", cash: "Наличными", unknown: "Способ не указан" } as const;
export const groups = [
  ["review", "Проверить чеки", FileCheck2],
  ["refund", "Вернуть покупателям", ArrowDownLeft],
  ["topUp", "Ждём покупателя", Clock3],
] as const;

export function MoneyOverview({
  query,
  choosePeriod,
  tasks,
  operations,
}: {
  query: QueryResult<SellerMoneyOverview>;
  choosePeriod: ReactNode;
  tasks: (group: SellerMoneyTask["kind"]) => void;
  operations: (method?: keyof typeof methods) => void;
}) {
  const allowed = errorKind(query.error) !== "access";
  return (
    <>
      {allowed && query.data && <MoneyTaskCounts counts={query.data.counts} open={tasks} />}
      <Card className="!space-y-0 !p-0">
        {allowed && <div className="grid gap-3 px-4 pt-4">{choosePeriod}</div>}
        <QueryBoundary query={query} template="list">
          {(data) => <MoneyTotals data={data} operations={operations} />}
        </QueryBoundary>
      </Card>
    </>
  );
}

function MoneyTaskCounts({
  counts,
  open,
}: {
  counts: SellerMoneyOverview["counts"];
  open: (group: SellerMoneyTask["kind"]) => void;
}) {
  return (
    <Card className="!space-y-0 !p-0">
      <h2 className="px-4 pt-4 text-title-3">Задачи</h2>
      <div className="grid divide-y divide-border px-1 pb-1">
        {groups.map(([group, title, Icon]) => (
          <ListItem
            key={group}
            variant="compact"
            title={title}
            icon={<Icon size={20} className="text-muted-foreground" aria-hidden />}
            value={
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <span className="font-semibold tabular-nums">{counts[group]}</span>
                <ChevronRight size={17} aria-hidden />
              </span>
            }
            onClick={() => open(group)}
          />
        ))}
      </div>
    </Card>
  );
}

function MoneyTotals({
  data,
  operations,
}: {
  data: SellerMoneyOverview;
  operations: (method?: keyof typeof methods) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div>
      <div className="px-4 pb-4 pt-3">
        <div className="grid grid-cols-2 divide-x divide-border">
          <button
            type="button"
            aria-expanded={expanded}
            className="flex min-h-11 items-start justify-between gap-1 rounded-md pr-2 text-left"
            onClick={() => setExpanded(!expanded)}
          >
            <Figure
              label="Получено"
              amount={data.receivedMinor}
              currency={data.currency}
              incomplete={data.receivedIncomplete}
            />
            <ChevronDown
              size={18}
              className={`mt-0.5 shrink-0 text-muted-foreground ${expanded ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>
          <div className="pl-3">
            <Figure
              label="Возвращено"
              amount={data.returnedMinor}
              currency={data.currency}
              incomplete={data.returnedIncomplete}
            />
          </div>
        </div>
      </div>
      {expanded && (
        <div className="grid divide-y divide-border border-t border-border px-1">
          {data.methods.length
            ? data.methods.map(({ method, amountMinor }) => (
                <ListItem
                  key={method}
                  variant="compact"
                  title={methods[method]}
                  value={
                    <span className="inline-flex items-center gap-1 whitespace-nowrap font-semibold">
                      {formatMinor(amountMinor, data.currency)} <ChevronRight size={17} aria-hidden />
                    </span>
                  }
                  onClick={() => operations(method)}
                />
              ))
            : !data.receivedIncomplete && (
                <p className="p-3 text-caption text-muted-foreground">Поступлений за период нет</p>
              )}
        </div>
      )}
      <div className="border-t border-border px-1 pb-1">
        <ListItem
          variant="compact"
          title="Операции"
          icon={<List size={20} className="text-muted-foreground" aria-hidden />}
          onClick={() => operations()}
        />
      </div>
    </div>
  );
}

function Figure({
  label,
  amount,
  incomplete,
  currency,
}: {
  label: string;
  amount: number | null;
  incomplete: boolean;
  currency: string;
}) {
  return (
    <span className="block min-w-0">
      <span className="block text-caption text-muted-foreground">{label}</span>
      <span className="mt-1 block tabular-nums text-title-2">
        {amount === null ? "—" : formatMinor(amount, currency)}
      </span>
      {incomplete && (
        <span className="mt-1 block text-small text-status-warning-foreground">Данные за период неполные</span>
      )}
    </span>
  );
}
