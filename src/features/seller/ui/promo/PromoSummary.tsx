import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { PromoTerms } from "../../../../shared/contracts/promo";
import { formatMinor, fromBasisPoints, multiplyMinor } from "../../../../shared/money";
import { Button } from "../../../../ui/Button";
import { Input } from "../../../../ui/Input";
import { Switch } from "../../../../ui/Switch";
import { example, type PromoCatalog } from "./api";

export function Summary({
  terms,
  currency,
  zone,
  catalog,
  used = 0,
}: {
  terms: PromoTerms;
  currency: string;
  zone: string;
  catalog?: PromoCatalog;
  used?: number;
}) {
  const money = (value: number) => formatMinor(value, currency);
  const discount = terms.discount;
  const maximum = discount.type === "fixed" ? discount.value : discount.capMinor;
  const scope = terms.scope;
  const names =
    scope.type === "all"
      ? "Все товары"
      : scope.ids
          .map((id) =>
            scope.type === "categories"
              ? (catalog?.categories.find((item) => item.id === id)?.name ?? "Категория")
              : scope.type === "products"
                ? (catalog?.variants.find((item) => item.productId === id)?.productName ?? "Товар")
                : (catalog?.variants
                    .filter((item) => item.id === id)
                    .map((item) => [item.productName, item.name].filter(Boolean).join(" · "))[0] ?? "Фасовка"),
          )
          .join(", ");
  return (
    <dl className="space-y-2 text-caption">
      <div>
        <dt className="text-label">{terms.name || "Без названия"}</dt>
        <dd>
          {discount.type === "fixed"
            ? money(discount.value)
            : `${fromBasisPoints(discount.value)}%${maximum ? `, до ${money(maximum)}` : ""}`}
        </dd>
      </div>
      <div>
        <dt className="sr-only">Способ применения</dt>
        <dd>
          {terms.kind === "code" ? `Промокод ${terms.code ?? ""}` : "Автоматически"} · {names}
        </dd>
      </div>
      {terms.purchase && (
        <div>
          <dt className="sr-only">Условие покупки</dt>
          <dd>
            {terms.purchase.mode === "exact"
              ? terms.purchase.number === 1
                ? "На первый заказ"
                : `Только заказ №${terms.purchase.number}`
              : `С заказа №${terms.purchase.number}`}
          </dd>
        </div>
      )}
      {(terms.confirmed || terms.purchase || terms.personalLimit) && (
        <div>
          <dt className="sr-only">Аудитория</dt>
          <dd>Подтверждённый покупатель · Telegram</dd>
        </div>
      )}
      {terms.minimumMinor && (
        <div>
          <dt className="sr-only">Минимум</dt>
          <dd>От {money(terms.minimumMinor)} подходящих товаров</dd>
        </div>
      )}
      {terms.minimumQuantity && (
        <div>
          <dt className="sr-only">Количество</dt>
          <dd>От {terms.minimumQuantity} подходящих единиц</dd>
        </div>
      )}
      <div>
        <dt className="sr-only">Срок</dt>
        <dd>
          {terms.fromDate || "Сразу"} · {terms.throughDate ? `по ${terms.throughDate} включительно` : "без срока"} ·{" "}
          {zone}
        </dd>
      </div>
      {terms.totalLimit && (
        <div>
          <dt className="sr-only">Общий лимит</dt>
          <dd>
            До {terms.totalLimit} применений на всех{used ? ` · осталось ${Math.max(0, terms.totalLimit - used)}` : ""}
          </dd>
        </div>
      )}
      {terms.purchase?.mode === "exact" ? (
        <div>
          <dt className="sr-only">Личный лимит</dt>
          <dd>Один раз на покупателя для этой покупки</dd>
        </div>
      ) : (
        terms.personalLimit && (
          <div>
            <dt className="sr-only">Личный лимит</dt>
            <dd>{terms.personalLimit} на покупателя</dd>
          </div>
        )
      )}
      {!!terms.totalLimit && !!maximum && (
        <div>
          <dt className="sr-only">Максимум</dt>
          <dd>
            Максимум {used ? "оставшихся " : ""}скидок —{" "}
            {money(multiplyMinor(Math.max(0, terms.totalLimit - used), maximum))}
          </dd>
        </div>
      )}
    </dl>
  );
}

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
