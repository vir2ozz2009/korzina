import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { calendarDate } from "../../../../shared/datetime";
import { Button } from "../../../../ui/Button";
import { Card } from "../../../../ui/Card";
import { Chip } from "../../../../ui/Chip";
import { IconButton } from "../../../../ui/IconButton";
import { Sheet } from "../../../../ui/Sheet";
import { labels, mondayFirst } from "./hours-form";

const monthLabel = new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", month: "long", year: "numeric" });
const dateLabel = new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });
const chipLabel = new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", day: "numeric", month: "short" });
const dateAt = (date: string) => new Date(`${date}T00:00:00Z`);

function moveMonth(month: string, delta: number) {
  const first = dateAt(month);
  first.setUTCMonth(first.getUTCMonth() + delta);
  return first.toISOString().slice(0, 10);
}

export function ClosedDates({
  today,
  dates,
  change,
  disabled,
}: {
  today: string;
  dates: string[];
  change: (dates: string[]) => void;
  disabled: boolean;
}) {
  const currentMonth = `${today.slice(0, 7)}-01`;
  const [selectedMonth, setSelectedMonth] = useState<string>();
  const month = selectedMonth ?? currentMonth;
  const start = dateAt(month);
  const leading = (start.getUTCDay() + 6) % 7;
  const monthLength = dateAt(calendarDate(moveMonth(month, 1), -1)).getUTCDate();
  const calendarDays = Array.from({ length: monthLength }, (_, index) => calendarDate(month, index));
  return (
    <Card className="min-w-0">
      <h2 className="sticky top-[calc(var(--safe-top)+var(--screen-header-height))] z-10 bg-card py-2 text-title-3">
        Не работаем
      </h2>
      {!!dates.length && (
        <div className="flex flex-wrap gap-2">
          {dates.map((date) => (
            <Chip
              key={date}
              aria-label={`Убрать выходной ${date}`}
              onClick={() => change(dates.filter((item) => item !== date))}
            >
              {chipLabel.format(dateAt(date)).replace(/\.$/u, "")} ✕
            </Chip>
          ))}
        </div>
      )}
      <Button variant="ghost" disabled={dates.length >= 366} onClick={() => setSelectedMonth(currentMonth)}>
        + Выбрать дату <span aria-hidden>›</span>
      </Button>
      <Sheet
        open={!!selectedMonth && !disabled}
        onOpenChange={(open) => {
          if (!open) setSelectedMonth(undefined);
        }}
        title="Выбрать дату"
      >
        <div className="flex items-center justify-between gap-1">
          <IconButton
            aria-label="Предыдущий месяц"
            disabled={month <= currentMonth}
            onClick={() => setSelectedMonth(moveMonth(month, -1))}
          >
            <ChevronLeft size={20} />
          </IconButton>
          <p aria-live="polite" className="text-label first-letter:uppercase">
            {monthLabel.format(start)}
          </p>
          <IconButton aria-label="Следующий месяц" onClick={() => setSelectedMonth(moveMonth(month, 1))}>
            <ChevronRight size={20} />
          </IconButton>
        </div>
        <div className="grid grid-cols-7 text-center">
          {mondayFirst.map((day) => (
            <span key={day} aria-hidden className="text-small text-muted-foreground">
              {labels[day]}
            </span>
          ))}
          {mondayFirst.slice(0, leading).map((day) => (
            <span key={`empty-${day}`} aria-hidden />
          ))}
          {calendarDays.map((date, index) => (
            <button
              key={date}
              type="button"
              aria-label={dateLabel.format(dateAt(date))}
              disabled={date < today || dates.includes(date)}
              className="min-h-11 rounded-lg text-label enabled:hover:bg-secondary focus-visible:outline-2 disabled:opacity-40"
              onClick={() => {
                change([...dates, date].sort());
                setSelectedMonth(undefined);
              }}
            >
              {index + 1}
            </button>
          ))}
        </div>
      </Sheet>
    </Card>
  );
}
