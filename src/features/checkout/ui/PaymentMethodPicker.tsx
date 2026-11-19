import { ArrowRightLeft, Banknote } from "lucide-react";
import type { ReactNode } from "react";
import type { CheckoutCommand } from "../../../shared/contracts/checkout";
import { Card } from "../../../ui/Card";
import { Radio } from "../../../ui/Radio";

type Method = CheckoutCommand["payment"];

const methods = {
  cash: { label: "Наличные", Icon: Banknote },
  transfer: { label: "Перевод", Icon: ArrowRightLeft },
};

export function PaymentMethodPicker({
  available,
  selected,
  disabled,
  select,
  children,
}: {
  available: readonly Method[];
  selected?: Method;
  disabled: boolean;
  select: (method: Method) => void;
  children?: ReactNode;
}) {
  return (
    <Card>
      <h2 className="text-title-3">Способ оплаты</h2>
      {available.length ? (
        <>
          <fieldset aria-label="Способ оплаты" disabled={disabled}>
            {available.map((method) => {
              const { label, Icon } = methods[method];
              return (
                <Radio
                  key={method}
                  name="payment"
                  checked={method === selected}
                  label={label}
                  icon={<Icon size={20} />}
                  onChange={() => select(method)}
                />
              );
            })}
          </fieldset>
          {!selected && <p className="text-meta text-muted-foreground">Выберите способ оплаты</p>}
        </>
      ) : (
        <p role="status" className="text-meta">
          Оплата пока недоступна
        </p>
      )}
      {children}
    </Card>
  );
}
