import { useState } from "react";
import type { ReceivingHours } from "../../../../shared/contracts/seller-receiving";
import { Button } from "../../../../ui/Button";
import { Card } from "../../../../ui/Card";
import { Chip } from "../../../../ui/Chip";
import { Input } from "../../../../ui/Input";
import { Select } from "../../../../ui/Select";
import { Switch } from "../../../../ui/Switch";
import { BuyerPreview } from "./BuyerPreview";
import { changeInterval, type Day, defaultRange, isValid, labels, mondayFirst, type Range } from "./hours-form";

export function HoursFields({
  title,
  value,
  change,
}: {
  title: string;
  value: ReceivingHours;
  change: (next: ReceivingHours) => void;
}) {
  const [byDay, setByDay] = useState(
    () => new Set(mondayFirst.map((day) => JSON.stringify(value.days[day] ?? []))).size > 1,
  );
  const [day, setDay] = useState<Day>("mon");
  const selected = byDay ? [day] : mondayFirst;
  const ranges = value.days[byDay ? day : "mon"] ?? [];
  function setRanges(next: Range[]) {
    change({ ...value, days: { ...value.days, ...Object.fromEntries(selected.map((key) => [key, next])) } });
  }
  const interval = value.interval;
  const capacity = interval === "day" ? "dayCapacity" : "capacity";
  const editableLimit = interval !== "after_order" && interval !== "custom";
  return (
    <Card>
      <h2 className="text-title-3">{title}</h2>
      <Switch
        label="Настроить по дням"
        checked={byDay}
        onChange={(event) => {
          if (!event.target.checked)
            change({ ...value, days: Object.fromEntries(mondayFirst.map((key) => [key, ranges])) });
          setByDay(event.target.checked);
        }}
      />
      {byDay && (
        <div className="flex flex-wrap gap-2">
          {mondayFirst.map((key) => (
            <Chip key={key} selected={day === key} onClick={() => setDay(key)}>
              {labels[key]}
            </Chip>
          ))}
        </div>
      )}
      {ranges.map((range, index) => (
        <div key={String(index)} className="grid grid-cols-2 gap-2">
          <Input
            label="Открываемся"
            type="time"
            value={range.start}
            onChange={(event) =>
              setRanges(ranges.map((item, i) => (i === index ? { ...item, start: event.target.value } : item)))
            }
          />
          <Input
            label="Закрываемся"
            type="time"
            value={range.end === "24:00" ? "00:00" : range.end}
            onChange={(event) =>
              setRanges(
                ranges.map((item, i) =>
                  i === index ? { ...item, end: event.target.value === "00:00" ? "24:00" : event.target.value } : item,
                ),
              )
            }
          />
          <Button variant="secondary" onClick={() => setRanges(ranges.filter((_, i) => i !== index))}>
            Убрать часы
          </Button>
        </div>
      ))}
      <Button variant="secondary" onClick={() => setRanges([...ranges, defaultRange])}>
        Добавить часы
      </Button>
      {!isValid(value) && <p role="alert">Проверьте начало и конец. Часы работы пересекаются.</p>}
      <Select
        label="Интервал"
        value={interval}
        options={[
          ...(interval === "custom" ? [{ value: "custom", label: "Сохранённые интервалы" }] : []),
          { value: "1", label: "1 час" },
          { value: "2", label: "2 часа" },
          { value: "3", label: "3 часа" },
          { value: "day", label: "Весь день" },
          { value: "after_order", label: "Согласуем после заказа" },
        ]}
        onChange={(next) => change(changeInterval(value, next as ReceivingHours["interval"]))}
      />
      {editableLimit && (
        <Switch
          label={interval === "day" ? "Ограничить число заказов в день" : "Ограничить число заказов в интервале"}
          checked={!!value[capacity]}
          onChange={(event) => change({ ...value, [capacity]: event.target.checked ? 4 : undefined })}
        />
      )}
      {editableLimit && value[capacity] !== undefined && (
        <Input
          min={1}
          type="number"
          label={interval === "day" ? "Заказов в день" : "Заказов в интервале"}
          value={value[capacity]}
          onChange={(event) => change({ ...value, [capacity]: Math.max(1, Number(event.target.value) || 1) })}
        />
      )}
      <details className="space-y-2">
        <summary className="text-label">Дополнительно</summary>
        <Input
          min={0}
          max={24}
          type="number"
          label="Готовим заказ, ч"
          value={value.preparationMinutes / 60}
          onChange={(event) =>
            change({
              ...value,
              preparationMinutes: Math.round(Math.min(24, Math.max(0, Number(event.target.value))) * 60),
            })
          }
        />
        <Input
          label="Заказы после — на завтра"
          type="time"
          value={value.dayCutoff}
          onChange={(event) => change({ ...value, dayCutoff: event.target.value })}
        />
      </details>
      <BuyerPreview>
        {interval === "after_order"
          ? "Согласуем время после заказа"
          : ranges.length
            ? [
                ranges.map(({ start, end }) => `${start}–${end}`).join(", "),
                interval === "custom" ? undefined : interval === "day" ? "В течение дня" : `Интервалы по ${interval} ч`,
              ]
                .filter(Boolean)
                .join(" · ")
            : "В этот день заказ недоступен"}
      </BuyerPreview>
    </Card>
  );
}
