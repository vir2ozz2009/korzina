import type { WorkdayFocus } from "../../../src/shared/contracts/workday";
import { calendarDate, shopDateTime, shopDayStart } from "../../../src/shared/datetime";

export function daySelection(day: string, timeZone: string, columnPrefix = "") {
  const next = calendarDate(day, 1);
  return {
    where: `((${columnPrefix}receiving_at>=? AND ${columnPrefix}receiving_at<?) OR (${columnPrefix}receiving_at='' AND ${columnPrefix}created_at>=? AND ${columnPrefix}created_at<?))`,
    values: [day, next, shopDayStart(day, timeZone), shopDayStart(next, timeZone)],
  };
}

export function localTimestamp(now: number, timeZone: string) {
  const { date, time } = shopDateTime(now, timeZone);
  return `${date}T${time}`;
}

export function focusSelection(focus: WorkdayFocus, cutoff: string) {
  switch (focus) {
    case "accept":
      return { where: "stage='placed'", values: [] };
    case "receipt":
      return { where: "stage<>'cancelled' AND payment_status='pending_review'", values: [] };
    case "payment":
      return {
        where:
          "((stage='ready' AND payment_status NOT IN ('confirmed','pending_review')) OR debt_minor>0 OR refund_minor>0)",
        values: [],
      };
    case "debt":
      return { where: "debt_minor>0", values: [] };
    case "overdue":
      return {
        where: "stage IN ('placed','accepted','ready','handed') AND receiving_at<>'' AND receiving_at<?",
        values: [cutoff],
      };
    default:
      return { where: "stage=?", values: [focus] };
  }
}
