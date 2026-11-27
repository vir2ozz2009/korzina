import { useState } from "react";
import type { PromoTerms } from "../../../../shared/contracts/promo";
import { currencyUnit, minorInput, parseMinorInput } from "../../../../shared/money";
import { Button } from "../../../../ui/Button";
import { Card } from "../../../../ui/Card";
import { Input } from "../../../../ui/Input";
import { promoLabels } from "./labels";
import { PromoSelect } from "./PromoSelect";

const scopeHint = "Учитываются только товары, участвующие в акции";

export function PromoConditions({
  terms,
  patch,
  currency,
}: {
  terms: PromoTerms;
  patch: (change: Partial<PromoTerms>) => void;
  currency: string;
}) {
  const [expanded, setExpanded] = useState(
    Boolean(
      terms.minimumMinor ||
        terms.minimumQuantity ||
        terms.confirmed ||
        terms.totalLimit ||
        terms.personalLimit ||
        (terms.discount.type === "percent" && terms.discount.capMinor),
    ),
  );
  const unit = currencyUnit(currency);
  const money = (value?: number) => (value ? minorInput(value, currency).replace(/,0+$/u, "") : "");
  if (terms.delivery)
    return (
      <Card>
        <h3 className="text-title-3">Условия</h3>
        <Input
          label="Минимальная сумма товаров"
          hint="После скидок на позиции, до общей скидки"
          unit={unit}
          inputMode="decimal"
          defaultValue={money(terms.minimumMinor)}
          onChange={(e) => patch({ minimumMinor: parseMinorInput(e.target.value, currency) || undefined })}
        />
        {terms.kind === "code" && (
          <>
            <Input
              label="Сколько раз можно применить всего"
              inputMode="numeric"
              value={terms.totalLimit ?? ""}
              onChange={(e) => patch({ totalLimit: Number(e.target.value) || undefined })}
            />
            <Input
              label="Сколько раз одному покупателю"
              inputMode="numeric"
              value={terms.personalLimit ?? ""}
              onChange={(e) => patch({ personalLimit: Number(e.target.value) || undefined })}
            />
            {terms.personalLimit && <p className="text-caption">Для личного лимита нужен Telegram.</p>}
          </>
        )}
      </Card>
    );
  return (
    <Card>
      <h3 className="text-title-3">Условия</h3>
      <PromoSelect
        label="На какой заказ"
        value={terms.purchase?.mode === "exact" && terms.purchase.number === 1 ? "first" : (terms.purchase?.mode ?? "")}
        onChange={(e) => {
          const value = e.target.value;
          patch({
            purchase: value
              ? { mode: value === "from" ? "from" : "exact", number: value === "first" ? 1 : 2 }
              : undefined,
          });
        }}
      >
        <option value="">Любой</option>
        <option value="first">На первый</option>
        <option value="exact">Только на заказ №…</option>
        <option value="from">Начиная с заказа №…</option>
      </PromoSelect>
      {terms.purchase && (terms.purchase.mode !== "exact" || terms.purchase.number !== 1) && (
        <Input
          label="Номер заказа"
          inputMode="numeric"
          value={terms.purchase.number}
          onChange={(e) => {
            if (terms.purchase) patch({ purchase: { ...terms.purchase, number: Number(e.target.value) } });
          }}
        />
      )}
      {!terms.purchase && <p className="text-caption">Любой заказ</p>}
      <div hidden={!expanded} className="space-y-3">
        <Input
          label={promoLabels.minimum}
          unit={unit}
          hint={scopeHint}
          inputMode="decimal"
          defaultValue={money(terms.minimumMinor)}
          onChange={(e) => patch({ minimumMinor: parseMinorInput(e.target.value, currency) || undefined })}
        />
        <Input
          label={promoLabels.quantity}
          unit="шт."
          hint={scopeHint}
          inputMode="numeric"
          value={terms.minimumQuantity ?? ""}
          onChange={(e) => patch({ minimumQuantity: Number(e.target.value) || undefined })}
        />
        <PromoSelect
          label="Аудитория"
          value={terms.confirmed || terms.purchase || terms.personalLimit ? "confirmed" : "all"}
          disabled={!!terms.purchase || !!terms.personalLimit}
          onChange={(e) => patch({ confirmed: e.target.value === "confirmed" })}
        >
          <option value="all">Все</option>
          <option value="confirmed">Подтверждённый покупатель</option>
        </PromoSelect>
        {terms.discount.type === "percent" && (
          <Input
            label={promoLabels.cap}
            unit={unit}
            inputMode="decimal"
            defaultValue={money(terms.discount.capMinor)}
            onChange={(e) => {
              if (terms.discount.type === "percent")
                patch({
                  discount: { ...terms.discount, capMinor: parseMinorInput(e.target.value, currency) || undefined },
                });
            }}
          />
        )}
        <Input
          label="Сколько раз можно применить всего"
          inputMode="numeric"
          value={terms.totalLimit ?? ""}
          onChange={(e) => patch({ totalLimit: Number(e.target.value) || undefined })}
        />
        <p className="text-caption">
          Общий лимит на всех покупателей. Например, 20 — это 20 применений на весь магазин.
        </p>
        {terms.purchase?.mode === "exact" ? (
          <p>Один раз на покупателя для этой покупки</p>
        ) : (
          <Input
            label="Сколько раз одному покупателю"
            inputMode="numeric"
            value={terms.personalLimit ?? ""}
            onChange={(e) => patch({ personalLimit: Number(e.target.value) || undefined })}
          />
        )}
        {(terms.confirmed || terms.purchase || terms.personalLimit) && (
          <p className="text-caption">Для этого условия нужен Telegram.</p>
        )}
      </div>
      <Button full variant="secondary" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        {expanded ? "Свернуть условия" : "Другие условия"}
      </Button>
    </Card>
  );
}
