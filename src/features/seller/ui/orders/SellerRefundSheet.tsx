import { useRef, useState } from "react";
import type { SellerOrder, SellerOrderCommand } from "../../../../shared/contracts/seller-order";
import { formatMinor, minorInput, parseMinorInput } from "../../../../shared/money";
import { Button } from "../../../../ui/Button";
import { Input } from "../../../../ui/Input";
import { Sheet } from "../../../../ui/Sheet";
import { TextArea } from "../../../../ui/TextArea";

type Mark = Extract<SellerOrderCommand, { action: "markRefundReturned" }>;
type Part = NonNullable<Mark["allocations"]>[number];
export function SellerRefundSheet({
  order,
  openRefund,
  pending,
  error,
  submit,
  close,
}: {
  order: SellerOrder;
  openRefund: boolean;
  pending: boolean;
  error?: string;
  submit: (input: SellerOrderCommand) => void;
  close: () => void;
}) {
  const maximum = openRefund ? (order.availableRefundMinor ?? 0) : (order.refund?.amountMinor ?? 0);
  const [amount, setAmount] = useState(minorInput(maximum, order.currency));
  const [note, setNote] = useState("");
  const [parts, setParts] = useState<Record<string, string>>({});
  const [expand, setExpand] = useState(false);
  const [invalid, setInvalid] = useState<string>();
  const form = useRef<HTMLFormElement>(null);
  const money = (value: number) => formatMinor(value, order.currency);
  const part = (kind: string, label: string) => (
    <Input
      label={label}
      key={kind}
      inputMode="decimal"
      value={parts[kind] ?? ""}
      disabled={pending}
      onChange={(event) => setParts({ ...parts, [kind]: event.target.value })}
    />
  );
  const expectedRevision = order.revision;
  function save() {
    const amountMinor = parseMinorInput(amount, order.currency);
    if (!amountMinor || amountMinor > maximum) {
      setInvalid(amountMinor ? `Укажите сумму не больше ${money(maximum)}` : "Введите сумму больше нуля");
      form.current?.querySelector<HTMLInputElement>("[name=amount]")?.focus();
      return;
    }
    if (openRefund) return submit({ action: "openRefund", amountMinor, expectedRevision });
    if (!order.refund || !note.trim()) return;
    const allocations: Part[] = [];
    for (const [key, value] of Object.entries(parts)) {
      if (!value.trim()) continue;
      const partial = parseMinorInput(value, order.currency);
      if (!partial) {
        setInvalid("Проверьте суммы в разбивке");
        return;
      }
      if (key === "items" || key === "delivery" || key === "overpayment")
        allocations.push({ kind: key, amountMinor: partial });
      else if (expand) allocations.push({ kind: "variant", variantId: key.slice(2), amountMinor: partial });
    }
    submit({
      action: "markRefundReturned",
      expectedRevision,
      amountMinor,
      refundId: order.refund.id,
      allocations: allocations.length ? allocations : undefined,
      comment: note.trim(),
    });
  }
  return (
    <Sheet
      open
      form
      title={openRefund ? "Открыть возврат" : "Записать возврат"}
      onOpenChange={(open) => {
        if (!open && !pending) close();
      }}
    >
      <form
        ref={form}
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <p>
          {openRefund ? "Доступно к возврату" : "Осталось вернуть"} {money(maximum)}
        </p>
        <Input
          name="amount"
          label="Сумма"
          inputMode="decimal"
          value={amount}
          disabled={pending}
          error={invalid}
          onChange={(event) => {
            setAmount(event.target.value);
            setInvalid(undefined);
          }}
        />
        {!openRefund && (
          <>
            <TextArea
              label="Комментарий"
              value={note}
              disabled={pending}
              maxLength={500}
              onChange={(event) => setNote(event.target.value)}
            />
            {order.refund?.needsAllocation && (
              <fieldset disabled={pending} className="space-y-3">
                <legend className="text-label">За что возврат</legend>
                {part("items", "Товары в целом")}
                {part("delivery", "Доставка")}
                {part("overpayment", "Переплата")}
                <Button full variant="secondary" aria-expanded={expand} onClick={() => setExpand(!expand)}>
                  Конкретные товары
                </Button>
                {expand &&
                  [...new Map(order.lines.map((line) => [line.variantId, line])).values()].map((line) =>
                    part(`v:${line.variantId}`, `${line.name} · ${line.unit}`),
                  )}
              </fieldset>
            )}
          </>
        )}
        {error && <p role="alert">{error}</p>}
        <Button full type="submit" loading={pending} disabled={!openRefund && !note.trim()}>
          {openRefund ? "Открыть возврат" : "Вернул"}
        </Button>
      </form>
    </Sheet>
  );
}
