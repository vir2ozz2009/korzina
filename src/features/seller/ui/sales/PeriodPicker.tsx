import { CalendarDays } from "lucide-react";
import { useState } from "react";
import { type SalesPeriod, salesPeriod } from "../../../../shared/contracts/seller-sales";
import { calendarDate } from "../../../../shared/datetime";
import { Button } from "../../../../ui/Button";
import { Input } from "../../../../ui/Input";
import { ListItem } from "../../../../ui/ListItem";
import { Sheet } from "../../../../ui/Sheet";
import { periodLabel, periodPreset } from "./dates";

export function PeriodPicker({
  period,
  timeZone,
  weeks = false,
  completedWeek = weeks,
  apply,
}: {
  period: SalesPeriod;
  timeZone: string;
  weeks?: boolean;
  completedWeek?: boolean;
  apply: (period: SalesPeriod) => void;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const [draft, setDraft] = useState(period);
  const [error, setError] = useState<"from" | "to" | "order">();
  const choose = (period: SalesPeriod) => {
    setOpen(false);
    apply(period);
  };
  const ranges = weeks
    ? ([
        ["7 полных дней, по вчера включительно", 7],
        ["2 недели", 14],
        ["3 недели", 21],
        ["4 недели", 28],
      ] as const)
    : ([
        ["Сегодня", 1],
        ["Вчера", -1],
        [completedWeek ? "7 полных дней, по вчера включительно" : "Последние 7 дней", 7],
        ["Последние 30 дней", 30],
      ] as const);
  return (
    <>
      <Button
        variant="secondary"
        icon={<CalendarDays size={16} />}
        onClick={() => {
          setDraft(period);
          setCustom(false);
          setError(undefined);
          setOpen(true);
        }}
      >
        Период
      </Button>
      <p className="text-small text-muted-foreground">{periodLabel(period)}</p>
      <Sheet open={open} title="Период" onOpenChange={setOpen}>
        {ranges.map(([label, days]) => (
          <ListItem
            key={label}
            title={label}
            onClick={() =>
              choose(periodPreset(timeZone, Math.abs(days), weeks || days < 0 || (days === 7 && completedWeek)))
            }
          />
        ))}
        <ListItem title="Свой период" onClick={() => setCustom(true)} />
        {custom && (
          <form
            className="space-y-3"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              const result = salesPeriod.safeParse(draft);
              const fromValid = salesPeriod.shape.from.safeParse(draft.from).success;
              const issue = !result.success
                ? fromValid
                  ? "to"
                  : "from"
                : draft.from > draft.to ||
                    draft.from < "1900-01-01" ||
                    draft.to > calendarDate(periodPreset(timeZone, 1, false).to, 0)
                  ? "order"
                  : undefined;
              if (issue) {
                setError(issue);
                const field = event.currentTarget.elements.namedItem(issue === "from" ? "start" : "end");
                if (field instanceof HTMLElement) field.focus();
                return;
              }
              choose(draft);
            }}
          >
            <Input
              label="Начало"
              type="date"
              name="start"
              value={draft.from}
              onChange={(e) => setDraft({ ...draft, from: e.target.value })}
              error={error === "from" ? "Введите дату" : undefined}
            />
            <Input
              label="Конец"
              type="date"
              name="end"
              value={draft.to}
              onChange={(e) => setDraft({ ...draft, to: e.target.value })}
              error={
                error === "to"
                  ? "Введите дату"
                  : error === "order"
                    ? draft.from > draft.to
                      ? "Конец периода раньше начала"
                      : "Проверьте даты периода"
                    : undefined
              }
            />
            <Button full type="submit">
              Применить
            </Button>
          </form>
        )}
      </Sheet>
    </>
  );
}
