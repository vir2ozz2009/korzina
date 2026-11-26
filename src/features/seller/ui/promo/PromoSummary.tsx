import type { PromoTerms } from "../../../../shared/contracts/promo";
import { formatMinor, fromBasisPoints, multiplyMinor } from "../../../../shared/money";
import type { PromoCatalog } from "./api";
import { promoLabels } from "./labels";

export function promoScope(terms: PromoTerms, catalog?: PromoCatalog) {
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
  return names;
}

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
  const names = promoScope(terms, catalog);
  return (
    <dl className="space-y-2 text-caption">
      <div>
        <dt className="text-label">{terms.name || "Без названия"}</dt>
        <dd>
          {discount.type === "fixed" ? promoLabels.fixed : promoLabels.percent} ·{" "}
          {discount.type === "fixed" ? money(discount.value) : `${fromBasisPoints(discount.value)} %`}
        </dd>
        {discount.type === "percent" && !!discount.capMinor && (
          <dd>
            {promoLabels.cap} · {money(discount.capMinor)}
          </dd>
        )}
      </div>
      <div>
        <dt className="sr-only">Способ применения</dt>
        <dd>
          {terms.kind === "code" ? `Промокод ${terms.code ?? ""}` : "Автоматически"} · {names}
        </dd>
      </div>
      <div>
        <dt className="sr-only">Показ в корзине</dt>
        <dd>{terms.publicInCart ? "Видна в корзине покупателя" : "Не показывается в корзине покупателя"}</dd>
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
          <dd>
            {promoLabels.minimum} · {money(terms.minimumMinor)}
          </dd>
        </div>
      )}
      {terms.minimumQuantity && (
        <div>
          <dt className="sr-only">Количество</dt>
          <dd>
            {promoLabels.quantity} · {terms.minimumQuantity} шт.
          </dd>
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
