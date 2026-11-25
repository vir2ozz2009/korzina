import { useState } from "react";
import type {
  PaymentMethod,
  ReceiptRef,
  SellerOrder,
  SellerOrderCommand,
} from "../../../../shared/contracts/seller-order";
import { formatShopTimestamp } from "../../../../shared/datetime";
import { formatMinor, minorInput, parseMinorInput } from "../../../../shared/money";
import { Button } from "../../../../ui/Button";
import { Input } from "../../../../ui/Input";
import { ListItem } from "../../../../ui/ListItem";
import { Sheet } from "../../../../ui/Sheet";
import { TextArea } from "../../../../ui/TextArea";
import { type Handoff, isHandoff } from "./order-actions";
import { ReceiptDocument } from "./ReceiptDocument";

export type PaymentSheetAction = Handoff | "recordPayment" | "correctPayment" | "confirmTransfer" | "setDeliveryFee";
export const paymentLabel = { cash: "Наличными", transfer: "Переводом" } as const;

export function OrderPaymentSheet({
  store,
  order,
  action,
  pending,
  error,
  close,
  submit,
}: {
  store: string;
  order: SellerOrder;
  action: PaymentSheetAction;
  pending: boolean;
  error?: string;
  close: () => void;
  submit: (input: SellerOrderCommand) => void;
}) {
  const { revision: expectedRevision, balance, currency } = order;
  const [method, setMethod] = useState<PaymentMethod | undefined>(
    action === "correctPayment" ? balance.latestPayment?.method : undefined,
  );
  const [view, setView] = useState<"confirm" | "reject" | "correct">();
  const [receipt, setReceipt] = useState<ReceiptRef>();
  const [reason, setReason] = useState("");
  const [value, setValue] = useState(
    minorInput(
      action === "correctPayment"
        ? (balance.latestPayment?.amountMinor ?? 0)
        : action === "setDeliveryFee" && order.fulfillment.mode === "delivery"
          ? (order.fulfillment.feeMinor ?? 0)
          : balance.outstandingMinor,
      currency,
    ),
  );
  const [validation, setValidation] = useState("");
  const reviewing = action === "confirmTransfer";
  const obligationId =
    order.paymentStatus !== "pending_review" && order.topUp?.status === "pending_review" ? order.topUp.id : undefined;
  const canReview = reviewing && (order.paymentStatus === "pending_review" || !!obligationId);
  const handoff = isHandoff(action) ? action : undefined;
  const latest = order.receipts[0];
  const parsed = parseMinorInput(value, currency);
  const amountMinor = parsed !== undefined && parsed <= 1_000_000_000_000 ? parsed : undefined;
  const showAmount = (!!method && !reviewing) || action === "setDeliveryFee" || view === "confirm";
  const money = (amount: number) => formatMinor(amount, currency);
  const title = receipt
    ? "Просмотр чека"
    : reviewing
      ? canReview
        ? "Проверить перевод"
        : "Просмотр чеков"
      : handoff
        ? `Заказ не оплачен · ${money(balance.outstandingMinor)}`
        : action === "correctPayment"
          ? "Исправить оплату"
          : action === "setDeliveryFee"
            ? "Стоимость доставки"
            : "Записать оплату";

  function save() {
    if (amountMinor === undefined || (action !== "setDeliveryFee" && amountMinor === 0)) {
      setValidation("Введите корректную сумму");
      return;
    }
    if (reviewing && latest) return submit({ action, expectedRevision, amountMinor, proof: latest.id, obligationId });
    if (action === "setDeliveryFee") return submit({ action, expectedRevision, amountMinor });
    if (!method) return;
    if (handoff) return submit({ action: handoff, expectedRevision, payment: { method, amountMinor } });
    if (action === "correctPayment" && view !== "correct") {
      setView("correct");
      return;
    }
    if (action === "correctPayment" || action === "recordPayment")
      submit({ action, expectedRevision, method, amountMinor });
  }

  return (
    <Sheet
      open
      title={title}
      form={showAmount || view === "reject"}
      onBack={receipt ? () => setReceipt(undefined) : undefined}
      onOpenChange={(open) => {
        if (!open && !pending) close();
      }}
    >
      <div className="space-y-3">
        {receipt ? (
          <ReceiptDocument key={receipt.id} store={store} number={order.number} receipt={receipt} />
        ) : (
          <>
            {handoff && !method && <p className="text-body">Как клиент заплатил?</p>}
            {reviewing && view === undefined && (
              <>
                {latest && (
                  <ListItem
                    title="Последний чек"
                    subtitle={formatShopTimestamp(latest.createdAt, order.timeZone)}
                    onClick={() => setReceipt(latest)}
                  />
                )}
                {order.receipts.length > 1 && (
                  <div>
                    <h3 className="text-label">История замен</h3>
                    {order.receipts.slice(1).map((file) => (
                      <ListItem
                        key={file.id}
                        title="Открыть чек"
                        subtitle={formatShopTimestamp(file.createdAt, order.timeZone)}
                        onClick={() => setReceipt(file)}
                      />
                    ))}
                  </div>
                )}
                {!latest && <p>Чек недоступен</p>}
                {canReview && (
                  <>
                    <Button full disabled={!latest || pending} onClick={() => setView("confirm")}>
                      Деньги пришли
                    </Button>
                    <Button full variant="secondary" disabled={!latest || pending} onClick={() => setView("reject")}>
                      Чек не подходит
                    </Button>
                  </>
                )}
              </>
            )}
            {view === "reject" && latest && (
              <>
                <TextArea label="Причина" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
                <Button
                  full
                  variant="secondary"
                  disabled={!reason.trim()}
                  loading={pending}
                  onClick={() =>
                    submit({
                      action: "rejectProof",
                      expectedRevision,
                      proof: latest.id,
                      reason: reason.trim(),
                      obligationId,
                    })
                  }
                >
                  Отклонить чек
                </Button>
              </>
            )}
            {!reviewing &&
              action !== "setDeliveryFee" &&
              view !== "correct" &&
              (!method || action === "correctPayment") && (
                <div className="grid gap-2">
                  {(Object.keys(paymentLabel) as PaymentMethod[]).map((option) => (
                    <Button
                      key={option}
                      full
                      disabled={pending}
                      variant={method === option ? "soft" : "secondary"}
                      aria-pressed={method === option}
                      onClick={() => setMethod(option)}
                    >
                      {paymentLabel[option]}
                    </Button>
                  ))}
                  {handoff && (
                    <Button
                      full
                      variant="secondary"
                      loading={pending}
                      onClick={() => submit({ action: handoff, expectedRevision, payment: { method: "debt" } })}
                    >
                      Не заплатил — записать долг
                    </Button>
                  )}
                </div>
              )}
            {action === "correctPayment" && balance.latestPayment && (
              <p>
                Было · {paymentLabel[balance.latestPayment.method]} · {money(balance.latestPayment.amountMinor)}
              </p>
            )}
            {showAmount && view !== "correct" && (
              <>
                <Input
                  label="Сумма"
                  inputMode="decimal"
                  value={value}
                  disabled={pending}
                  onChange={(e) => {
                    setValue(e.target.value);
                    setValidation("");
                  }}
                />
                {action === "setDeliveryFee" && <p className="text-meta text-muted-foreground">0 — бесплатно</p>}
              </>
            )}
            {view === "correct" && method && amountMinor !== undefined && (
              <p>
                Станет · {paymentLabel[method]} · {money(amountMinor)}
              </p>
            )}
            {(showAmount || view === "correct") && (
              <Button full loading={pending} onClick={save}>
                {action === "setDeliveryFee"
                  ? "Сохранить стоимость"
                  : view === "correct"
                    ? "Подтвердить исправление"
                    : action === "correctPayment"
                      ? "Проверить изменения"
                      : action === "confirmTransfer"
                        ? "Подтвердить поступление"
                        : handoff
                          ? "Подтвердить сумму"
                          : "Записать оплату"}
              </Button>
            )}
            {(error || validation) && <p role="alert">{validation || error}</p>}
          </>
        )}
      </div>
    </Sheet>
  );
}
