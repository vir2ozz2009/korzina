import { useState } from "react";
import type { PromoTerms } from "../../../../shared/contracts/promo";
import { Button } from "../../../../ui/Button";
import { Input } from "../../../../ui/Input";
import { Switch } from "../../../../ui/Switch";
import type { PromoCatalog } from "./api";
export function PromoExampleControls({
  terms,
  catalog,
  lines,
  pending,
  confirmed,
  setConfirmed,
  completed,
  setCompleted,
  setQuantity,
}: {
  terms: PromoTerms;
  catalog?: PromoCatalog;
  lines?: Record<string, number>;
  pending: boolean;
  confirmed: boolean;
  setConfirmed: (value: boolean) => void;
  completed: number;
  setCompleted: (value: number) => void;
  setQuantity: (id: string, quantity: number) => void;
}) {
  const [variant, setVariant] = useState("");
  return (
    <details className="mx-3 my-3 space-y-3 rounded-xl bg-card p-3">
      <summary className="min-h-8 cursor-pointer text-label">Изменить пример</summary>
      <label className="block">
        Фасовка
        <select
          className="min-h-12 w-full rounded-lg border border-border bg-card px-3"
          value={variant}
          disabled={pending}
          onChange={(event) => setVariant(event.target.value)}
        >
          <option value="">Выберите товар</option>
          {catalog?.variants.map((item) => (
            <option value={item.id} key={item.id}>
              {item.productName} · {item.name}
            </option>
          ))}
        </select>
      </label>
      <Button
        variant="secondary"
        disabled={
          !variant ||
          pending ||
          (!lines?.[variant] && Object.keys(lines ?? {}).filter((id) => lines?.[id]).length >= 50)
        }
        onClick={() => setQuantity(variant, (lines?.[variant] ?? 0) + 1)}
      >
        Добавить товар
      </Button>
      {Object.entries(lines ?? {}).map(([id, quantity]) => {
        const item = catalog?.variants.find((row) => row.id === id);
        return (
          <Input
            key={id}
            label={item ? `${item.productName} · ${item.name}` : id}
            type="number"
            min={0}
            max={999}
            value={quantity}
            disabled={pending}
            onChange={(event) => setQuantity(id, Number(event.target.value))}
          />
        );
      })}
      {!terms.delivery && (
        <>
          <Switch
            label="Подтверждённый покупатель"
            checked={confirmed}
            disabled={pending}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <Input
            label="Выполнено заказов"
            type="number"
            min={0}
            max={1_000_000}
            value={completed}
            disabled={pending}
            onChange={(event) =>
              setCompleted(Math.max(0, Math.min(1_000_000, Math.trunc(Number(event.target.value)) || 0)))
            }
          />
        </>
      )}
    </details>
  );
}
