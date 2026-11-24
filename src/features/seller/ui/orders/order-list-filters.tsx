import type { SellerOrderSummary } from "../../../../shared/contracts/seller-order";
import { shopDateTime } from "../../../../shared/datetime";
import { Button } from "../../../../ui/Button";
import { Radio } from "../../../../ui/Radio";
import { Sheet } from "../../../../ui/Sheet";
import { methodLabel } from "./OrderIndicators";

type Method = "delivery" | "pickup";
type Filter = Method | "all";

export function OrderFilterSheet({
  value,
  setValue,
  apply,
  reset,
}: {
  value: Filter;
  setValue: (value: Filter | undefined) => void;
  apply: (method?: Method) => void;
  reset: () => void;
}) {
  return (
    <Sheet
      open
      title="Фильтры"
      onOpenChange={(open) => {
        if (!open) setValue(undefined);
      }}
    >
      {(["all", "delivery", "pickup"] as const).map((mode) => (
        <Radio
          key={mode}
          name="receiving-filter"
          label={mode === "all" ? "Все способы" : methodLabel[mode]}
          checked={value === mode}
          onChange={() => setValue(mode)}
        />
      ))}
      <Button
        full
        onClick={() => {
          apply(value === "all" ? undefined : value);
          setValue(undefined);
        }}
      >
        Применить
      </Button>
      <Button
        full
        variant="ghost"
        onClick={() => {
          reset();
          setValue(undefined);
        }}
      >
        Сбросить фильтры
      </Button>
    </Sheet>
  );
}

export function groupOrders(orders: SellerOrderSummary[], tab: "active" | "completed", timeZone: string) {
  const groups = new Map<string, SellerOrderSummary[]>();
  for (const order of orders) {
    const key =
      tab === "active"
        ? order.stage
        : order.completedAt !== undefined
          ? shopDateTime(order.completedAt, timeZone).date
          : order.receivingAt.slice(0, 10) || shopDateTime(order.createdAt, timeZone).date;
    const rows = groups.get(key);
    if (rows) rows.push(order);
    else groups.set(key, [order]);
  }
  return groups;
}
