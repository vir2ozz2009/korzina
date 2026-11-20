import { useState } from "react";
import type { SellerOrder, SellerOrderCommand } from "../../../../shared/contracts/seller-order";
import { Button } from "../../../../ui/Button";
import { Radio } from "../../../../ui/Radio";
import { Sheet } from "../../../../ui/Sheet";
import { TextArea } from "../../../../ui/TextArea";
import { methodLabel, stageLabel } from "./OrderIndicators";
import { type Handoff, mainAction, rollbackStage } from "./order-actions";

export type StageSheetAction = Handoff | "markReady" | "cancel" | "rollback" | "waiveDue" | "markRefundReturned";
export function OrderStageSheet({
  order,
  action,
  pending,
  error,
  close,
  submit,
}: {
  order: SellerOrder;
  action: StageSheetAction;
  pending: boolean;
  error?: string;
  close: () => void;
  submit: (input: SellerOrderCommand) => void;
}) {
  const [reason, setReason] = useState("");
  const [returnStock, setReturnStock] = useState<boolean>();
  const delivery = order.receiving.mode === "delivery";
  const previous = rollbackStage(order.stage, delivery);
  const late =
    action === "cancel" && (order.handedOff || (!delivery && (order.stage === "ready" || order.readyForPickup)));
  const withReason = action === "cancel" || action === "rollback" || action === "waiveDue";
  const title =
    action === "markReady"
      ? "Сборка точно завершена?"
      : action === "cancel"
        ? "Отменить заказ?"
        : action === "rollback" && previous
          ? `Вернуть заказ на этап «${stageLabel(previous, order.receiving.mode)}»?`
          : action === "waiveDue"
            ? "Списать долг?"
            : action === "markRefundReturned"
              ? "Деньги возвращены?"
              : `${mainAction(order.stage, delivery)?.label ?? "Подтвердить"}?`;

  function save() {
    const expectedRevision = order.revision;
    if (action === "cancel") submit({ action, expectedRevision, reason: reason.trim(), returnStock });
    else if (action === "rollback" || action === "waiveDue")
      submit({ action, expectedRevision, reason: reason.trim() });
    else if (action === "markReady") submit({ action, expectedRevision, confirmIncomplete: true });
    else submit({ action, expectedRevision });
  }

  return (
    <Sheet
      open
      title={title}
      form={withReason}
      onOpenChange={(open) => {
        if (!open && !pending) close();
      }}
    >
      <div className="space-y-3">
        {action === "markReady" ? (
          <p>
            Отмечено {order.packed.length} из {order.lines.length}
          </p>
        ) : (
          <p>
            Заказ №{order.number} · {methodLabel[order.receiving.mode]}
            {order.time && ` · ${order.time.date} ${order.time.slotId ?? ""}`}
          </p>
        )}
        {withReason && (
          <TextArea
            label="Причина"
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={pending}
          />
        )}
        {late && (
          <fieldset>
            <legend className="text-label">Вернуть товар в остатки?</legend>
            <Radio
              name="stock-return"
              label="Да"
              checked={returnStock === true}
              onChange={() => setReturnStock(true)}
            />
            <Radio
              name="stock-return"
              label="Нет"
              checked={returnStock === false}
              onChange={() => setReturnStock(false)}
            />
          </fieldset>
        )}
        {error && <p role="alert">{error}</p>}
        <Button
          full
          loading={pending}
          disabled={(withReason && !reason.trim()) || (late && returnStock === undefined)}
          onClick={save}
        >
          {action === "markReady" ? "Сборка завершена" : action === "cancel" ? "Отменить заказ" : "Подтвердить"}
        </Button>
        {action === "markReady" && (
          <Button full variant="secondary" disabled={pending} onClick={close}>
            Назад
          </Button>
        )}
      </div>
    </Sheet>
  );
}
