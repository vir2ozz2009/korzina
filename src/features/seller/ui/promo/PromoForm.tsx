import { useState } from "react";
import type { PromoTerms } from "../../../../shared/contracts/promo";
import { currencyUnit, fromBasisPoints, minorInput, parseMinorInput, toBasisPoints } from "../../../../shared/money";
import { Card } from "../../../../ui/Card";
import { Input } from "../../../../ui/Input";
import { Switch } from "../../../../ui/Switch";
import type { PromoCatalog } from "./api";

type Scope = PromoTerms["scope"]["type"];

import { promoLabels } from "./labels";
import { PromoConditions } from "./PromoConditions";
import { PromoSelect } from "./PromoSelect";

export function PromoForm({
  terms,
  set,
  currency,
  catalog,
  zone,
}: {
  terms: PromoTerms;
  set: (value: PromoTerms) => void;
  currency: string;
  catalog?: PromoCatalog;
  zone: string;
}) {
  const [dated, setDated] = useState(Boolean(terms.fromDate || terms.throughDate));
  const unit = currencyUnit(currency);
  const patch = (value: Partial<PromoTerms>) => set({ ...terms, ...value });
  const choices =
    terms.scope.type === "categories"
      ? catalog?.categories
      : terms.scope.type === "products"
        ? [...new Map(catalog?.variants.map((v) => [v.productId, { id: v.productId, name: v.productName }])).values()]
        : catalog?.variants.map((v) => ({ id: v.id, name: [v.productName, v.name].filter(Boolean).join(" · ") }));
  const money = (value?: number) => (value ? minorInput(value, currency).replace(/,0+$/u, "") : "");
  return (
    <div className="space-y-3">
      <Card>
        <Input label="Название" maxLength={120} value={terms.name} onChange={(e) => patch({ name: e.target.value })} />
        <PromoSelect
          label="Способ применения"
          value={terms.kind}
          onChange={(event) => {
            const kind = event.target.value === "code" ? "code" : "automatic";
            patch({
              kind,
              code: kind === "automatic" ? undefined : terms.code,
              personalLimit: kind === "code" ? (terms.personalLimit ?? 1) : undefined,
            });
          }}
        >
          <option value="automatic">Автоматически</option>
          <option value="code">По промокоду</option>
        </PromoSelect>
        {terms.kind === "code" && (
          <Input
            label="Код"
            maxLength={40}
            value={terms.code ?? ""}
            onChange={(e) => patch({ code: e.target.value || undefined })}
          />
        )}
        <PromoSelect
          label="Размер скидки"
          value={terms.discount.type}
          onChange={(e) =>
            patch({
              discount: e.target.value === "fixed" ? { type: "fixed", value: 0 } : { type: "percent", value: 0 },
            })
          }
        >
          <option value="percent">Процент</option>
          <option value="fixed">Сумма</option>
        </PromoSelect>
        <Input
          key={terms.discount.type}
          label={terms.discount.type === "percent" ? promoLabels.percent : promoLabels.fixed}
          unit={terms.discount.type === "percent" ? "%" : unit}
          inputMode="decimal"
          defaultValue={
            terms.discount.type === "percent"
              ? fromBasisPoints(terms.discount.value) || ""
              : money(terms.discount.value)
          }
          onChange={(e) =>
            patch({
              discount: {
                ...terms.discount,
                value:
                  terms.discount.type === "percent"
                    ? toBasisPoints(e.target.value)
                    : (parseMinorInput(e.target.value, currency) ?? 0),
              },
            })
          }
        />
      </Card>
      <Card>
        <PromoSelect
          label="На какие товары"
          inline
          value={terms.scope.type}
          onChange={(e) => {
            const type = e.target.value as Scope;
            patch({ scope: type === "all" ? { type } : { type, ids: [] } });
          }}
        >
          <option value="all">Все товары</option>
          <option value="variants">Фасовки</option>
          <option value="products">Товары</option>
          <option value="categories">Категории</option>
        </PromoSelect>
        {terms.scope.type !== "all" && (
          <fieldset className="max-h-48 space-y-2 overflow-auto">
            <legend>Подходящие позиции</legend>
            {choices?.map((item) => (
              <label key={item.id} className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={terms.scope.type !== "all" && terms.scope.ids.includes(item.id)}
                  onChange={(e) => {
                    if (terms.scope.type === "all") return;
                    const ids = terms.scope.ids.filter((id) => id !== item.id);
                    if (e.target.checked) ids.push(item.id);
                    patch({ scope: { ...terms.scope, ids } });
                  }}
                />
                {item.name}
              </label>
            ))}
          </fieldset>
        )}
      </Card>
      <PromoConditions {...{ terms, patch, currency }} />
      <Card>
        <Switch
          label="Показывать в корзине покупателя"
          checked={!!terms.publicInCart}
          onChange={(event) => patch({ publicInCart: event.target.checked })}
        />
        <p className="text-caption text-muted-foreground">
          Покупатели увидят условия предложения и смогут применить публичный промокод прямо из корзины.
        </p>
      </Card>
      <Card>
        <PromoSelect
          label="Срок"
          value={dated ? "dates" : "none"}
          onChange={(event) => {
            const show = event.target.value === "dates";
            setDated(show);
            if (!show) patch({ fromDate: undefined, throughDate: undefined });
          }}
        >
          <option value="none">Без срока</option>
          <option value="dates">Указать даты</option>
        </PromoSelect>
        {dated && (
          <>
            <p className="text-caption">Часовой пояс магазина · {zone}</p>
            <Input
              type="date"
              label="Начало"
              value={terms.fromDate ?? ""}
              onChange={(e) => patch({ fromDate: e.target.value || undefined })}
            />
            <Input
              type="date"
              label="По дату включительно"
              value={terms.throughDate ?? ""}
              onChange={(e) => patch({ throughDate: e.target.value || undefined })}
            />
          </>
        )}
      </Card>
    </div>
  );
}
