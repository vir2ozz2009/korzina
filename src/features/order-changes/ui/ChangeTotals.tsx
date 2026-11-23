import type { CompositionTotals } from "../../../shared/contracts/order-changes";
import { formatMinor } from "../../../shared/money";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { StatusPill } from "../../../ui/StatusPill";

export function ChangeAmount({ delta, currency, pending }: { delta: number; currency: string; pending?: boolean }) {
  if (!delta && !pending) return null;
  return (
    <StatusPill tone={delta > 0 ? "warning" : delta < 0 ? "success" : "neutral"}>
      {delta !== 0 && `${delta > 0 ? "+" : "−"}${formatMinor(Math.abs(delta), currency)}`}
      {pending && (delta ? " · ждём ответа" : "Ждём ответа")}
    </StatusPill>
  );
}

export function ChangeTotals({
  totals,
  seller,
  onTopUp,
}: {
  totals: CompositionTotals;
  seller?: boolean;
  onTopUp?: () => void;
}) {
  const { originalMinor, currentMinor, currency, refundMinor, topUpMinor } = totals;
  return (
    <Card aria-live="polite" className="border border-border">
      <p className="text-label">
        Итог: {formatMinor(originalMinor, currency)} → {formatMinor(currentMinor, currency)}
      </p>
      {!!refundMinor && (
        <p>
          {seller ? "Вы вернёте" : "Магазин вернёт вам"} {formatMinor(refundMinor, currency)}
        </p>
      )}
      {!!topUpMinor &&
        (onTopUp ? (
          <Button full onClick={onTopUp}>
            Доплатить {formatMinor(topUpMinor, currency)}
          </Button>
        ) : (
          <p>
            {seller ? "Покупатель доплатит" : "Нужно доплатить"} {formatMinor(topUpMinor, currency)}
          </p>
        ))}
    </Card>
  );
}
