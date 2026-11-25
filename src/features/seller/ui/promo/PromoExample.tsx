import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { PromoTerms } from "../../../../shared/contracts/promo";
import { formatMinor } from "../../../../shared/money";
import { Button } from "../../../../ui/Button";
import { Input } from "../../../../ui/Input";
import { Switch } from "../../../../ui/Switch";
import { example, type PromoCatalog } from "./api";

export function PromoExample({
  terms,
  currency,
  catalog,
  store,
}: {
  terms: PromoTerms;
  currency: string;
  catalog?: PromoCatalog;
  store: string;
}) {
  const [lines, setLines] = useState<Record<string, number>>({});
  const [confirmed, setConfirmed] = useState(true);
  const [completed, setCompleted] = useState(0);
  const [variant, setVariant] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      example(
        store,
        terms,
        Object.entries(lines)
          .filter(([, quantity]) => quantity > 0)
          .map(([variantId, quantity]) => ({ variantId, quantity })),
        confirmed,
        completed,
      ),
    networkMode: "always",
  });
  const reset = () => mutation.reset();
  return (
    <div className="space-y-3">
      <label className="block">
        Фасовка
        <select
          className="min-h-12 w-full rounded-lg border border-border bg-card px-3"
          value={variant}
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
        disabled={!variant}
        onClick={() => {
          setLines({ ...lines, [variant]: (lines[variant] ?? 0) + 1 });
          reset();
        }}
      >
        Добавить товар
      </Button>
      {Object.entries(lines).map(([id, quantity]) => {
        const item = catalog?.variants.find((row) => row.id === id);
        return (
          <Input
            key={id}
            label={item ? [item.productName, item.name].join(" · ") : id}
            type="number"
            min={0}
            max={999}
            value={quantity}
            onChange={(event) => {
              setLines({ ...lines, [id]: Number(event.target.value) });
              reset();
            }}
          />
        );
      })}
      <Switch
        label="Подтверждённый покупатель"
        checked={confirmed}
        onChange={(event) => {
          setConfirmed(event.target.checked);
          reset();
        }}
      />
      <Input
        label="Уже выполнено заказов"
        type="number"
        min={0}
        value={completed}
        onChange={(event) => {
          setCompleted(Number(event.target.value));
          reset();
        }}
      />
      <p className="text-caption">Только для этого примера</p>
      <Button full variant="secondary" loading={mutation.isPending} onClick={() => mutation.mutate()}>
        Пересчитать пример
      </Button>
      {mutation.isError && <p role="alert">{mutation.error.message}</p>}
      {mutation.data && (
        <div aria-live="polite" className="space-y-1">
          {mutation.data.lines.map((line) => (
            <p key={line.variantId}>
              {line.name} · {line.quantity} · {formatMinor(line.totalMinor ?? 0, currency)}
            </p>
          ))}
          <p>Товары · {formatMinor(mutation.data.itemsMinor ?? mutation.data.totalMinor, currency)}</p>
          {mutation.data.adjustments.map((item) => (
            <p key={item.sourceId}>
              {item.label} · −{formatMinor(-item.amount, currency)}
            </p>
          ))}
          {!mutation.data.adjustments.length && <p>На этом примере скидка не применяется</p>}
          <p>Итого за товары {formatMinor(mutation.data.totalMinor, currency)}</p>
        </div>
      )}
    </div>
  );
}
