import { useDeferredValue, useState } from "react";
import { QueryBoundary } from "../../../app/shell/QueryBoundary";
import type { OrderLine } from "../../../shared/contracts/order-changes";
import { Button } from "../../../ui/Button";
import { ListItem } from "../../../ui/ListItem";
import { SearchField } from "../../../ui/SearchField";
import { Sheet } from "../../../ui/Sheet";
import { Stepper } from "../../../ui/Stepper";
import { type ReplacementPick, useReplacementPicks } from "../api";

export function ReplacementPicker({
  store,
  number,
  line,
  choose,
  back,
}: {
  store: string;
  number: number;
  line: OrderLine;
  choose: (id: string, quantity: number) => void;
  back: () => void;
}) {
  const [search, setSearch] = useState("");
  const [choice, setChoice] = useState<ReplacementPick>();
  const [quantity, setQuantity] = useState(line.quantity);
  const query = useReplacementPicks(store, number, useDeferredValue(search.trim()), !choice);
  const max = choice?.stock ?? 999;
  return (
    <Sheet
      open
      title="Выберите замену"
      onBack={choice ? () => setChoice(undefined) : back}
      onOpenChange={(open) => {
        if (!open) back();
      }}
    >
      {choice ? (
        <>
          <p className="text-label">
            {choice.name} · {choice.unit}
          </p>
          {quantity > max && <p role="alert">Доступно {max}. Уменьшите количество.</p>}
          <Stepper value={quantity} max={max} onChange={setQuantity} />
          <Button full disabled={quantity > max} onClick={() => choose(choice.variantId, quantity)}>
            Выбрать
          </Button>
        </>
      ) : (
        <>
          <SearchField value={search} onChange={setSearch} label="Поиск по товарам магазина" />
          <QueryBoundary query={query} template="list">
            {(data) => {
              const products = data.filter(({ variantId }) => variantId !== line.variantId);
              return products.length ? (
                products.map((item) => (
                  <ListItem
                    key={item.variantId}
                    title={item.name}
                    subtitle={item.unit}
                    onClick={() => {
                      setChoice(item);
                      setQuantity(line.quantity);
                    }}
                  />
                ))
              ) : (
                <p>Товары не найдены</p>
              );
            }}
          </QueryBoundary>
        </>
      )}
    </Sheet>
  );
}
