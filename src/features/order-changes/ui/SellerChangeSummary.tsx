import type { CompositionSummary } from "../../../shared/contracts/order-changes";
import { shopDateTime } from "../../../shared/datetime";
import { Card } from "../../../ui/Card";
import { ChangeAmount } from "./ChangeTotals";

export function SellerChangeSummary({ change, timeZone }: { change: CompositionSummary; timeZone: string }) {
  const count = change.lines.filter(({ status }) => status === "pending").length;
  return (
    <Card>
      <h2 className="text-title-3">Изменения</h2>
      {!!count && change.expiresAt && (
        <>
          <p className="text-label">
            Ждём ответа на {count} · до {shopDateTime(change.expiresAt, timeZone).time}
          </p>
          <p>Собирайте остальное. Передать заказ можно после ответа.</p>
        </>
      )}
      {change.lines.map((line) => (
        <div key={line.id} className="flex flex-wrap items-center justify-between gap-1 border-t border-border py-2">
          <div>
            <p className="text-label">{line.before?.name ?? line.after?.name}</p>
            {line.kind === "decrease" ? (
              <p>
                Есть {line.after?.quantity} из {line.before?.quantity}
              </p>
            ) : line.kind === "remove" ? (
              <p>Нет в наличии — убрали</p>
            ) : line.status === "pending" ? (
              <p>Замена: {line.after?.name}</p>
            ) : line.status === "accepted" ? (
              <p>Замена: {line.after?.name} · согласен ✓</p>
            ) : (
              <p>
                {line.status === "declined"
                  ? "Отказался"
                  : line.status === "expired"
                    ? "Срок ответа истёк"
                    : "Предложение закрыто"}
              </p>
            )}
          </div>
          <ChangeAmount delta={line.deltaMinor} currency={change.totals.currency} pending={line.status === "pending"} />
        </div>
      ))}
    </Card>
  );
}
