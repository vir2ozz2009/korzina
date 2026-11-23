import { useRef } from "react";
import { useToast } from "../../../app/shell/ToastProvider";
import type { BuyerOrder } from "../../../shared/contracts/buyer-order";
import { HttpError } from "../../../shared/http-error";
import { Button } from "../../../ui/Button";
import { Sheet } from "../../../ui/Sheet";
import { useOrderChange } from "../api";

export function CancelOrderSheet({
  order,
  close,
  refresh,
}: {
  order: BuyerOrder;
  close: () => void;
  refresh: () => void;
}) {
  const change = useOrderChange(order.number);
  const toast = useToast();
  const attempt = useRef<{ key: string; expectedVersion: number }>(undefined);
  function cancel() {
    attempt.current ??= { key: crypto.randomUUID(), expectedVersion: order.version };
    change.mutate(attempt.current, {
      onSuccess: () => {
        close();
        toast("Заказ отменён");
      },
      onError: (error) => {
        if (error instanceof HttpError && (error.code === "CANCEL_NOT_ALLOWED" || error.code === "VERSION_CONFLICT")) {
          attempt.current = undefined;
          refresh();
        }
      },
    });
  }
  return (
    <Sheet
      open
      title={`Отменить заказ №${order.number}?`}
      onOpenChange={(open) => {
        if (!open && !change.isPending) close();
      }}
    >
      {change.error && <p role="alert">{change.error.message}</p>}
      <Button full loading={change.isPending} disabled={!order.canCancel} onClick={cancel}>
        Отменить заказ
      </Button>
      {change.isPending && <p role="status">Отменяем…</p>}
      <Button full variant="secondary" disabled={change.isPending} onClick={close}>
        Оставить заказ
      </Button>
    </Sheet>
  );
}
