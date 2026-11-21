import { type ReactNode, useId, useState } from "react";
import type { Preparation } from "../../../../shared/contracts/receiving-time";
import { preparationMinutes } from "../../../../shared/receiving-hours";
import { Button } from "../../../../ui/Button";
import { Card } from "../../../../ui/Card";
import { Chip } from "../../../../ui/Chip";
import { Input } from "../../../../ui/Input";
import { Radio } from "../../../../ui/Radio";
import { HoursTimeRange } from "./HoursTimeRange";
import { changeDays, defaultRange, type Hours, isValid, labels, mondayFirst, preview } from "./hours-form";

const preparations: [Preparation, string][] = [
  ["now", "Сразу"],
  ["hour", "1 час"],
  ["two_hours", "2 часа"],
  ["next_day", "На следующий день"],
];
const modes = [
  ["slots", "Ко времени"],
  ["day", "Только день, в течение дня"],
  ["after_order", "Договоримся после заказа"],
] as const;

export function HoursFields({
  title,
  value,
  change,
  extra,
}: {
  title: string;
  value: Hours;
  change: (next: Hours) => void;
  extra?: ReactNode;
}) {
  const id = useId();
  const active = mondayFirst.filter((day) => value.days[day]?.length);
  const first = value.days[active[0]]?.[0];
  const [emptyRange, setEmptyRange] = useState(defaultRange);
  const [byDay, setByDay] = useState(() => new Set(active.map((day) => JSON.stringify(value.days[day]?.[0]))).size > 1);
  const common = first ?? emptyRange;
  const mode = value.interval === "day" || value.interval === "after_order" ? value.interval : "slots";
  const capacity = mode === "day" ? "dayCapacity" : "capacity";
  const previewText = `Покупатель увидит · ${preview(value)}`;

  return (
    <Card role="region" aria-labelledby={id} className="min-w-0">
      <h2
        id={id}
        className="sticky top-[calc(var(--safe-top)+var(--screen-header-height))] z-10 bg-card py-2 text-title-3"
      >
        {title}
      </h2>
      <fieldset aria-label="Рабочие дни" className="grid min-w-0 grid-cols-7 gap-1">
        {mondayFirst.map((day) => (
          <Chip
            key={day}
            className={`min-w-0 px-0! ${active.includes(day) ? "" : "bg-secondary!"}`}
            selected={active.includes(day)}
            onClick={() => {
              setEmptyRange(common);
              const days = active.includes(day) ? active.filter((item) => item !== day) : [...active, day];
              change(changeDays(value, days, byDay ? undefined : common));
            }}
          >
            {labels[day]}
          </Chip>
        ))}
      </fieldset>
      {byDay ? (
        active.map((day) => {
          const range = value.days[day]?.[0] ?? defaultRange;
          return (
            <div key={day} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2">
              <span className="w-6 text-label">{labels[day]}</span>
              <HoursTimeRange
                day={labels[day]}
                value={range}
                change={(next) => change({ ...value, days: { ...value.days, [day]: [next] } })}
              />
            </div>
          );
        })
      ) : (
        <HoursTimeRange
          value={common}
          change={(range) => {
            setEmptyRange(range);
            change(changeDays(value, active, range));
          }}
        />
      )}
      <Button
        variant="ghost"
        aria-expanded={byDay}
        onClick={() => {
          if (byDay) change(changeDays(value, active, common));
          setByDay(!byDay);
        }}
      >
        {byDay ? "Общее время для всех дней" : "Разное время по дням"}
      </Button>
      {!isValid(value) && <p role="alert">Проверьте часы работы и лимит заказов.</p>}
      <fieldset className="min-w-0 space-y-2">
        <legend className="text-label">Как покупатель выбирает время</legend>
        {modes.map(([kind, label]) => (
          <div key={kind} className={`rounded-lg border border-border px-3 ${mode === kind ? "bg-secondary" : ""}`}>
            <Radio
              name={id}
              label={label}
              checked={mode === kind}
              onChange={() => change({ ...value, interval: kind === "slots" ? "2" : kind })}
            />
            {kind === "slots" && mode === "slots" && (
              <label className="flex min-w-0 items-center gap-2 pb-2 text-small">
                Интервалы по
                <select
                  aria-label="Длительность интервала"
                  value={value.interval}
                  onChange={(event) => change({ ...value, interval: event.target.value as "1" | "2" | "3" })}
                  className="min-h-11 min-w-0 rounded-lg bg-input px-2 text-label"
                >
                  <option value="1">1 часу</option>
                  <option value="2">2 часа</option>
                  <option value="3">3 часа</option>
                </select>
              </label>
            )}
          </div>
        ))}
      </fieldset>
      <fieldset className="min-w-0 space-y-2">
        <legend className="text-label">Сколько готовите заказ</legend>
        <div className="flex flex-wrap gap-1.5">
          {preparations.map(([preparation, label]) => (
            <Chip
              key={preparation}
              selected={preparation === value.preparation}
              className={preparation === value.preparation ? "" : "bg-secondary!"}
              onClick={() => change({ ...value, preparation, preparationMinutes: preparationMinutes[preparation] })}
            >
              {label}
            </Chip>
          ))}
        </div>
      </fieldset>
      {mode !== "after_order" &&
        (value[capacity] === undefined ? (
          <Button variant="ghost" onClick={() => change({ ...value, [capacity]: 4 })}>
            Ограничить число заказов
          </Button>
        ) : (
          <div className="space-y-1">
            <Input
              label={mode === "day" ? "Не больше заказов в день" : "Не больше заказов в интервал"}
              min={1}
              max={100000}
              type="number"
              value={Number.isNaN(value[capacity]) ? "" : value[capacity]}
              onChange={(event) => change({ ...value, [capacity]: event.target.valueAsNumber })}
            />
            <Button variant="ghost" onClick={() => change({ ...value, [capacity]: undefined })}>
              Снять ограничение
            </Button>
          </div>
        ))}
      {extra}
      <output
        aria-label="Покупатель увидит"
        title={previewText}
        className="block truncate rounded-lg bg-secondary px-1 py-2 text-micro font-normal tracking-tight"
      >
        {previewText}
      </output>
    </Card>
  );
}
