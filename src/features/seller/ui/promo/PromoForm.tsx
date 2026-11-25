import type { PromoTerms } from "../../../../shared/contracts/promo";
import { fromBasisPoints, minorInput, parseMinorInput, toBasisPoints } from "../../../../shared/money";
import { Input } from "../../../../ui/Input";
import { Switch } from "../../../../ui/Switch";
import type { PromoCatalog } from "./api";

type Scope = PromoTerms["scope"]["type"];
const selectClass = "min-h-12 w-full rounded-lg border border-border bg-card px-3";
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
  const patch = (value: Partial<PromoTerms>) => set({ ...terms, ...value });
  const choices =
    terms.scope.type === "categories"
      ? catalog?.categories
      : terms.scope.type === "products"
        ? [...new Map(catalog?.variants.map((v) => [v.productId, { id: v.productId, name: v.productName }])).values()]
        : catalog?.variants.map((v) => ({ id: v.id, name: [v.productName, v.name].filter(Boolean).join(" · ") }));
  const money = (value?: number) => (value ? minorInput(value, currency).replace(/,0+$/u, "") : "");
  return (
    <div className="space-y-4">
      <Input label="Название" maxLength={120} value={terms.name} onChange={(e) => patch({ name: e.target.value })} />
      <label className="block space-y-1">
        <span>Способ применения</span>
        <select
          className={selectClass}
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
        </select>
      </label>
      {terms.kind === "code" && (
        <Input
          label="Код"
          maxLength={40}
          value={terms.code ?? ""}
          onChange={(e) => patch({ code: e.target.value || undefined })}
        />
      )}
      <label className="block space-y-1">
        <span>Размер скидки</span>
        <select
          className={selectClass}
          value={terms.discount.type}
          onChange={(e) =>
            patch({
              discount: e.target.value === "fixed" ? { type: "fixed", value: 0 } : { type: "percent", value: 0 },
            })
          }
        >
          <option value="percent">Процент</option>
          <option value="fixed">Сумма</option>
        </select>
      </label>
      <Input
        key={terms.discount.type}
        label={terms.discount.type === "percent" ? "Процент" : "Сумма"}
        inputMode="decimal"
        defaultValue={
          terms.discount.type === "percent" ? fromBasisPoints(terms.discount.value) || "" : money(terms.discount.value)
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
      {terms.discount.type === "percent" && (
        <Input
          label="Максимум скидки"
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
      <label className="block space-y-1">
        <span>На какие товары</span>
        <select
          className={selectClass}
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
        </select>
      </label>
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
      <Input
        label="Минимальная сумма подходящих товаров"
        inputMode="decimal"
        defaultValue={money(terms.minimumMinor)}
        onChange={(e) => patch({ minimumMinor: parseMinorInput(e.target.value, currency) || undefined })}
      />
      <Input
        label="Минимальное количество"
        inputMode="numeric"
        value={terms.minimumQuantity ?? ""}
        onChange={(e) => patch({ minimumQuantity: Number(e.target.value) || undefined })}
      />
      <Switch
        label="Только подтверждённый покупатель"
        checked={terms.confirmed || !!terms.purchase || !!terms.personalLimit}
        disabled={!!terms.purchase || !!terms.personalLimit}
        onChange={(e) => patch({ confirmed: e.target.checked })}
      />
      <label className="block space-y-1">
        <span>На какой заказ</span>
        <select
          className={selectClass}
          value={
            terms.purchase?.mode === "exact" && terms.purchase.number === 1 ? "first" : (terms.purchase?.mode ?? "")
          }
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
        </select>
      </label>
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
      <Input
        label="Сколько раз можно применить всего"
        inputMode="numeric"
        value={terms.totalLimit ?? ""}
        onChange={(e) => patch({ totalLimit: Number(e.target.value) || undefined })}
      />
      <p className="text-caption">Общий лимит на всех покупателей. Например, 20 — это 20 применений на весь магазин.</p>
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
      <p className="text-label">Срок · {zone}</p>
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
    </div>
  );
}
