import type { PromoTerms } from "../../../../shared/contracts/promo";
import { Card } from "../../../../ui/Card";
import { Input } from "../../../../ui/Input";
import type { PromoCatalog } from "./api";
import { PromoBundleFields } from "./PromoBundleFields";
import { PromoSelect } from "./PromoSelect";
import { promoCountInput } from "./promo-count";

export function PromoGroupFields({
  terms,
  patch,
  currency,
  catalog,
}: {
  terms: PromoTerms;
  patch: (change: Partial<PromoTerms>) => void;
  currency: string;
  catalog?: PromoCatalog;
}) {
  const group = terms.group;
  if (!group) return null;
  const variants = catalog?.variants ?? [];
  const products = [...new Map(variants.map((item) => [item.productId, item])).values()];
  const scope = terms.scope;
  const scopeChoices =
    scope.type === "categories"
      ? catalog?.categories
      : scope.type === "products"
        ? products.map(({ productId, productName }) => ({ id: productId, name: productName }))
        : variants.map(({ id, productName, name }) => ({ id, name: [productName, name].filter(Boolean).join(" · ") }));
  const bundleLimit = group.type === "bundle" ? (group.limit === null ? undefined : (group.limit ?? 1)) : group.limit;
  return (
    <>
      <Card>
        <Input label="Название" maxLength={120} value={terms.name} onChange={(e) => patch({ name: e.target.value })} />
        {group.type === "gift" && (
          <>
            {promoCountInput("Купить", group.buy || undefined, (buy) => patch({ group: { ...group, buy } }))}
            {promoCountInput("В подарок", group.gift || undefined, (gift) => patch({ group: { ...group, gift } }))}
          </>
        )}
      </Card>
      {group.type === "gift" ? (
        <Card>
          <PromoSelect
            label="Какие товары участвуют"
            value={scope.type}
            onChange={(e) => {
              const type = e.target.value as "variants" | "products" | "categories";
              patch({ scope: { type, ids: [] } });
            }}
          >
            <option value="variants">Фасовки</option>
            <option value="products">Товары</option>
            <option value="categories">Категории</option>
          </PromoSelect>
          {scope.type !== "all" && (
            <fieldset className="max-h-48 space-y-2 overflow-auto">
              <legend>Подходящие позиции</legend>
              {scopeChoices?.map(({ id, name }) => (
                <label key={id} className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={scope.ids.includes(id)}
                    onChange={(event) =>
                      patch({
                        scope: {
                          ...scope,
                          ids: event.target.checked ? [...scope.ids, id] : scope.ids.filter((item) => item !== id),
                        },
                      })
                    }
                  />
                  {name}
                </label>
              ))}
            </fieldset>
          )}
        </Card>
      ) : (
        <PromoBundleFields {...{ terms, group, patch, currency, catalog }} />
      )}
      <Card>
        {promoCountInput(
          group.type === "gift"
            ? "Сколько раз акция сработает в одном заказе"
            : "Сколько наборов в заказе получат скидку",
          bundleLimit,
          (value) =>
            patch({
              group:
                group.type === "gift" ? { ...group, limit: value || undefined } : { ...group, limit: value || null },
            }),
          true,
        )}
        {group.type === "gift" && !!group.buy && !!group.gift && bundleLimit !== undefined && (
          <p className="text-caption">
            Из {(group.buy + group.gift) * Math.max(2, bundleLimit)} одинаковых упаковок в подарок:{" "}
            {group.gift * bundleLimit}.
          </p>
        )}
      </Card>
    </>
  );
}
