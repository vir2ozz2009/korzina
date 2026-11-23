import type { CompositionLine, TimeChange } from "../../../src/shared/contracts/order-changes";
import { defaultShopTimeZone, formatShopDay } from "../../../src/shared/datetime";
import { formatMinor } from "../../../src/shared/money";

export function compositionNotification(details: string | null, currency: string, number: number) {
  const event = JSON.parse(details ?? "{}") as { lines?: CompositionLine[]; stage?: string };
  const title = event.stage === "cancelled" ? `Заказ №${number} отменён` : `Изменения в заказе №${number}`;
  const lines = (event.lines ?? []).slice(0, 6).map(({ before, after, status }) => {
    const label = (line: NonNullable<CompositionLine["before"]>) =>
      `${line.name} · ${line.unit} × ${line.quantity} · ${formatMinor(line.totalMinor, currency)}`;
    const previous = before ? `Было: ${label(before)}` : "";
    const next = after ? `${status === "pending" ? "Предлагаем" : "Стало"}: ${label(after)}` : "Убрали из заказа";
    return [previous, next].filter(Boolean).join("\n");
  });
  return [title, ...lines].join("\n\n");
}

export function timeNotification(details: string | null, number: number, now: number) {
  const { change, timeZone = defaultShopTimeZone } = JSON.parse(details ?? "{}") as {
    change?: TimeChange;
    timeZone?: string;
  };
  if (!change) return `Изменение времени · заказ №${number}`;
  const format = (time: TimeChange["before"]) =>
    time
      ? [formatShopDay(time.date, timeZone, now), time.slotId?.replace("-", "–")].filter(Boolean).join(" · ")
      : "Время согласуем";
  const text =
    change.status === "pending"
      ? "Магазин предлагает другое время"
      : change.status === "accepted"
        ? "Время изменено"
        : "Время остаётся прежним";
  const changes =
    change.status === "pending" || change.status === "accepted"
      ? `
Было: ${format(change.before)}
${change.status === "pending" ? "Предлагаем" : "Стало"}: ${format(change.proposed)}`
      : `
${format(change.before)}`;
  return `${text} · заказ №${number}${changes}`;
}
