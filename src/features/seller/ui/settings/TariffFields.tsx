import type { DeliveryTariff } from "../../../../shared/contracts/receiving";
import { Select } from "../../../../ui/Select";
import { MoneyField } from "./MoneyField";

export function TariffFields({
  tariff,
  currency,
  setTariff,
}: {
  tariff: DeliveryTariff;
  currency: string;
  setTariff: (tariff: DeliveryTariff) => void;
}) {
  return (
    <>
      <Select
        label="Цена доставки"
        value={tariff.kind}
        options={[
          { value: "free", label: "Бесплатно" },
          { value: "fixed", label: "Фиксированная сумма" },
          { value: "after_order", label: "Посчитаем после заказа" },
        ]}
        onChange={(kind) => {
          if (kind === "fixed") setTariff({ kind: "fixed", feeMinor: 100 });
          else setTariff({ kind: kind === "after_order" ? "after_order" : "free" });
        }}
      />
      {tariff.kind === "fixed" && (
        <MoneyField
          label="Сумма"
          min={1}
          amount={tariff.feeMinor}
          currency={currency}
          change={(feeMinor) => setTariff({ kind: "fixed", feeMinor })}
        />
      )}
    </>
  );
}
