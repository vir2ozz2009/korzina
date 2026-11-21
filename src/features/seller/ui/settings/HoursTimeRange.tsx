import { clockTime } from "../../../../shared/receiving-hours";
import type { Range } from "./hours-form";

const times = Array.from({ length: 96 }, (_, index) => clockTime(index * 15));
const closingTimes = [...times.slice(1), "24:00"];

export function HoursTimeRange({ value, change, day }: { value: Range; change: (range: Range) => void; day?: string }) {
  const fields = [
    { key: "start", word: "с", label: "Открытие", options: times },
    { key: "end", word: "до", label: "Закрытие", options: closingTimes },
  ] as const;
  return (
    <div className="grid min-w-0 grid-cols-2 gap-2">
      {fields.map(({ key, word, label, options }) => (
        <label key={key} className="flex min-w-0 items-center gap-2 text-label">
          {word}
          <select
            aria-label={day ? `${label} ${day}` : label}
            value={value[key]}
            onChange={(event) => change({ ...value, [key]: event.target.value })}
            className="min-h-11 min-w-0 flex-1 rounded-lg bg-input px-2 text-label tabular-nums"
          >
            {(options.includes(value[key]) ? options : [...options, value[key]].sort()).map((time) => (
              <option key={time}>{time}</option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}
