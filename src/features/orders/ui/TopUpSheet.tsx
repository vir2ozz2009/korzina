import { useState } from "react";
import { QueryBoundary } from "../../../app/shell/QueryBoundary";
import type { BuyerOrder } from "../../../shared/contracts/buyer-order";
import { formatMinor } from "../../../shared/money";
import { Button } from "../../../ui/Button";
import { Radio } from "../../../ui/Radio";
import { Sheet } from "../../../ui/Sheet";
import { TransferInstruction } from "../../checkout";
import { useChooseTopUp, useTopUpChoices } from "../../order-changes";
import { OrderProofSheet } from "./OrderProofSheet";

export function TopUpSheet({ order, close }: { order: BuyerOrder; close: () => void }) {
  const choices = useTopUpChoices(order.number, true);
  const choose = useChooseTopUp(order.number);
  const [selected, setSelected] = useState<string>();
  const [step, setStep] = useState<"method" | "pay" | "proof">("method");
  const option = order.topUpPayment;
  if (step === "proof") return <OrderProofSheet order={order} close={() => setStep("pay")} saved={close} />;
  return (
    <Sheet
      open
      title={step === "method" ? "Способ оплаты" : "Доплата"}
      onOpenChange={(open) => {
        if (!open && !choose.isPending) close();
      }}
      onBack={step === "pay" ? () => setStep("method") : undefined}
    >
      {step === "pay" && option ? (
        <>
          <p className="text-title-2">{formatMinor(order.debtMinor ?? 0, order.currency)}</p>
          <p>{option.name}</p>
          {option.id === "cash" ? (
            <p>Отдайте {order.receiving.mode === "delivery" ? "курьеру при получении" : "при получении"}</p>
          ) : (
            <>
              <TransferInstruction instruction={option.instruction} qrSrc={option.imageSrc} details={option.details} />
              {option.requiresReceipt && (
                <Button full onClick={() => setStep("proof")}>
                  Прикрепить чек
                </Button>
              )}
            </>
          )}
          <Button full variant="secondary" onClick={close}>
            К заказу
          </Button>
        </>
      ) : (
        <QueryBoundary query={choices} template="form">
          {(data) => {
            const method = data.options.find(({ id }) => id === (selected ?? data.selected)) ?? data.options[0];
            return (
              <>
                <p className="text-title-2">К доплате {formatMinor(data.amountMinor, order.currency)}</p>
                <fieldset disabled={choose.isPending} className="grid gap-2">
                  {data.options.map((item) => (
                    <Radio
                      key={item.id}
                      name="top-up-method"
                      label={item.name}
                      checked={item.id === method?.id}
                      onChange={() => setSelected(item.id)}
                    />
                  ))}
                </fieldset>
                {choose.error && <p role="alert">{choose.error.message}</p>}
                {!data.options.length && <p>Способы оплаты пока недоступны</p>}
                <Button
                  full
                  loading={choose.isPending}
                  disabled={!method}
                  onClick={() => {
                    if (method)
                      choose.mutate(
                        { expectedVersion: order.version, methodId: method.id },
                        { onSuccess: () => setStep("pay") },
                      );
                  }}
                >
                  Продолжить
                </Button>
              </>
            );
          }}
        </QueryBoundary>
      )}
    </Sheet>
  );
}
