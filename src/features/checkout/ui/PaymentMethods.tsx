import type { PaymentOption } from "../../../shared/contracts/seller-payments";
import { Card } from "../../../ui/Card";
import { Radio } from "../../../ui/Radio";
import { TransferInstruction } from "./PaymentExtras";
import { ReceiptField } from "./ReceiptField";
import type { useReceipt } from "./useReceipt";

type Choice = Pick<
  PaymentOption,
  "id" | "name" | "description" | "instruction" | "details" | "imageSrc" | "requiresReceipt"
>;

export function PaymentMethods({
  choices,
  selected,
  select,
  receipt,
  busy,
  locked,
  quoteRevision,
}: {
  choices: Choice[] | undefined;
  selected: Choice | undefined;
  select: (id: string) => void;
  receipt: ReturnType<typeof useReceipt>;
  busy: boolean;
  locked: boolean;
  quoteRevision: string;
}) {
  return (
    <Card>
      <h2 className="text-title-3">Способ оплаты</h2>
      <fieldset aria-label="Способ оплаты" disabled={busy}>
        {choices?.map((item) => (
          <div key={item.id}>
            <Radio
              name="payment"
              checked={item.id === selected?.id}
              label={item.name}
              onChange={() => select(item.id)}
            />
            {item.description && <p className="pl-7 text-small text-muted-foreground">{item.description}</p>}
          </div>
        ))}
      </fieldset>
      {selected && selected.id !== "cash" && (
        <>
          <TransferInstruction
            key={selected.imageSrc}
            instruction={selected.instruction}
            qrSrc={selected.imageSrc}
            details={selected.details}
          />
          {selected.requiresReceipt && <ReceiptField quoteRevision={quoteRevision} receipt={receipt} locked={locked} />}
        </>
      )}
    </Card>
  );
}
