import type { WorkdayFocus } from "../../../../shared/contracts/workday";
import { calendarDate } from "../../../../shared/datetime";
import { Chip } from "../../../../ui/Chip";

export const workdayLabels: Record<WorkdayFocus, string> = {
  placed: "Новые",
  accepted: "Собираются",
  ready: "Ждут выдачи",
  handed: "У курьера",
  accept: "Принять",
  receipt: "Проверить чек",
  payment: "Решить по оплате",
  overdue: "Просроченные",
  debt: "Долги клиентов",
};
const plurals = new Intl.PluralRules("ru");
export function orderCount(count: number) {
  const form = plurals.select(count);
  return `${count} ${form === "one" ? "заказ" : form === "few" ? "заказа" : "заказов"}`;
}

export function WorkdayDays({
  day,
  today,
  select,
  calendar,
}: {
  day: string;
  today: string;
  select: (day: string) => void;
  calendar: () => void;
}) {
  const tomorrow = calendarDate(today, 1);
  return (
    <fieldset className="flex flex-wrap gap-2" aria-label="День">
      <Chip selected={day === today} onClick={() => select(today)}>
        Сегодня
      </Chip>
      <Chip selected={day === tomorrow} onClick={() => select(tomorrow)}>
        Завтра
      </Chip>
      <Chip selected={day !== today && day !== tomorrow} onClick={calendar}>
        Календарь
      </Chip>
    </fieldset>
  );
}
