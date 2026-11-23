import type { CompositionLine } from "../../../src/shared/contracts/order-changes";
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
