import { useState } from "react";
import type { PromoTerms } from "../../../../shared/contracts/promo";
import {
  addMinor,
  currencyUnit,
  formatMinor,
  minorInput,
  multiplyMinor,
  parseMinorInput,
} from "../../../../shared/money";
import { Button } from "../../../../ui/Button";
import { Card } from "../../../../ui/Card";
import { Input } from "../../../../ui/Input";
import { Switch } from "../../../../ui/Switch";
import type { PromoCatalog } from "./api";
import { PromoSelect } from "./PromoSelect";
import { promoCountInput } from "./promo-count";

export function PromoBundleFields({
  terms,
  group,
  patch,
  currency,
  catalog,
}: {
  terms: PromoTerms;
  group: Extract<NonNullable<PromoTerms["group"]>, { type: "bundle" }>;
  patch: (change: Partial<PromoTerms>) => void;
  currency: string;
  catalog?: PromoCatalog;
}) {
  const [adding, setAdding] = useState(false);
  const variants = catalog?.variants ?? [];
  const products = [...new Map(variants.map((item) => [item.productId, item])).values()];
  return (
    <>
      <Card>
        <h3 className="text-title-3">Состав набора</h3>
        {group.components.map((part, index) => {
          const item = variants.find(({ id }) => id === part.variantId);
          const used = new Set(group.components.filter((_, i) => i !== index).map(({ variantId }) => variantId));
          const update = (next: typeof part) =>
            patch({
              group: {
                ...group,
                components: group.components.map((previous, i) => (i === index ? next : previous)),
              },
            });
          return (
            <fieldset key={part.variantId} className="space-y-2">
              <legend>{item?.productName ?? "Недоступная фасовка"}</legend>
              <PromoSelect
                label="Фасовка"
                value={part.variantId}
                onChange={(e) => update({ ...part, variantId: e.target.value })}
              >
                {!item && <option value={part.variantId}>Недоступна</option>}
                {variants
                  .filter((variant) => variant.productId === item?.productId && !used.has(variant.id))
                  .map((variant) => (
                    <option key={variant.id} value={variant.id}>
                      {variant.name || item?.productName}
                    </option>
                  ))}
              </PromoSelect>
              {promoCountInput("Количество в одном наборе", part.quantity || undefined, (quantity) =>
                update({ ...part, quantity }),
              )}
              <Button
                variant="secondary"
                onClick={() =>
                  patch({ group: { ...group, components: group.components.filter((_, i) => i !== index) } })
                }
              >
                Убрать
              </Button>
            </fieldset>
          );
        })}
        {adding && (
          <PromoSelect
            label="Товар"
            value=""
            onChange={(e) => {
              const variant = variants.find(
                ({ productId, id }) =>
                  productId === e.target.value && !group.components.some((part) => part.variantId === id),
              );
              if (variant)
                patch({
                  group: { ...group, components: [...group.components, { variantId: variant.id, quantity: 1 }] },
                });
              setAdding(false);
            }}
          >
            <option value="">Выберите товар</option>
            {products
              .filter(({ productId }) =>
                variants.some(
                  ({ id, productId: owner }) =>
                    owner === productId && !group.components.some((part) => part.variantId === id),
                ),
              )
              .map(({ productId, productName }) => (
                <option key={productId} value={productId}>
                  {productName}
                </option>
              ))}
          </PromoSelect>
        )}
        <Button variant="secondary" onClick={() => setAdding(!adding)}>
          Добавить товар
        </Button>
        {!!group.components.length && (
          <p>
            Отдельно ·{" "}
            {formatMinor(
              addMinor(
                ...group.components.map(({ variantId, quantity }) =>
                  multiplyMinor(
                    variants.find(({ id }) => id === variantId)?.priceMinor ?? 0,
                    Math.max(0, Math.trunc(quantity)),
                  ),
                ),
              ),
              currency,
            )}
          </p>
        )}
        <Input
          label="Цена набора"
          unit={currencyUnit(currency)}
          inputMode="decimal"
          defaultValue={group.priceMinor ? minorInput(group.priceMinor, currency) : ""}
          onChange={(e) => patch({ group: { ...group, priceMinor: parseMinorInput(e.target.value, currency) ?? 0 } })}
        />
      </Card>
      <Card>
        <PromoSelect
          label="Способ применения"
          value={terms.kind}
          onChange={(e) =>
            patch(
              e.target.value === "code"
                ? { kind: "code" }
                : { kind: "automatic", code: undefined, publicInCart: undefined },
            )
          }
        >
          <option value="automatic">Автоматически</option>
          <option value="code">По промокоду</option>
        </PromoSelect>
        {terms.kind === "code" && (
          <>
            <Input
              label="Код"
              maxLength={40}
              value={terms.code ?? ""}
              onChange={(e) => patch({ code: e.target.value || undefined })}
            />
            <Switch
              label="Показывать в корзине покупателя"
              checked={!!terms.publicInCart}
              onChange={(e) => patch({ publicInCart: e.target.checked })}
            />
          </>
        )}
      </Card>
    </>
  );
}
