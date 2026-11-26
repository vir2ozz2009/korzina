import { ImageOff, Percent, Tag } from "lucide-react";
import type { ComponentProps } from "react";
import type { PromoOffer, PromoPrice, PromoStatus, PromoTerms } from "../../../../shared/contracts/promo";
import { formatMinor, fromBasisPoints } from "../../../../shared/money";
import { ruPlural } from "../../../../shared/ru-plural";
import { interactive } from "../../../../ui/interactive";
import { ProductImage } from "../../../../ui/ProductImage";

export const statusTitle: Record<PromoStatus, string> = {
  active: "Действует",
  scheduled: "Запланировано",
  draft: "Черновик",
  ended: "Завершено",
  disabled: "Отключено",
};
const statusTone: Record<PromoStatus, string> = {
  active: "bg-status-success text-status-success-foreground",
  scheduled: "bg-status-warning text-status-warning-foreground",
  draft: "bg-status-neutral text-status-neutral-foreground",
  ended: "bg-status-neutral text-status-neutral-foreground",
  disabled: "bg-status-danger text-status-danger-foreground",
};
export function PromoBadge({ status }: { status: PromoStatus }) {
  return (
    <span className={`shrink-0 inline-flex min-h-6 items-center rounded-pill px-2 text-micro ${statusTone[status]}`}>
      {statusTitle[status]}
    </span>
  );
}

export function promoPeriod(from?: string, through?: string) {
  const display = (date: string) =>
    new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "long",
      ...(Number(date.slice(0, 4)) !== new Date().getFullYear() && { year: "numeric" }),
      timeZone: "UTC",
    }).format(new Date(`${date}T00:00:00Z`));
  return [from && `с ${display(from)}`, through && `по ${display(through)}`].filter(Boolean).join(" ") || "Без срока";
}

export function personalLimit(terms: PromoTerms) {
  return terms.purchase?.mode === "exact"
    ? "Один раз на покупателя для этой покупки"
    : terms.personalLimit
      ? `До ${terms.personalLimit} одному покупателю`
      : undefined;
}

export function promoBenefit(terms: PromoTerms, currency: string) {
  if (terms.group?.type === "gift") return `${terms.group.buy + terms.group.gift} по цене ${terms.group.buy}`;
  if (terms.group?.type === "bundle") return formatMinor(terms.group.priceMinor, currency);
  const discount = terms.discount;
  return discount.type === "fixed"
    ? formatMinor(discount.value, currency)
    : `${fromBasisPoints(discount.value)}%${discount.capMinor ? `, до ${formatMinor(discount.capMinor, currency)}` : ""}`;
}

export function promoConditions(terms: PromoTerms, currency: string, scope?: string) {
  const method = terms.kind === "automatic" ? "Автоматически" : terms.code || "По промокоду";
  const purchase =
    terms.purchase?.mode === "exact"
      ? terms.purchase.number === 1
        ? "На первый заказ"
        : `Только заказ №${terms.purchase.number}`
      : terms.purchase
        ? `С заказа №${terms.purchase.number}`
        : "Любой заказ";
  return [
    method,
    purchase,
    scope ??
      (terms.group?.type === "bundle"
        ? "Комбо-набор"
        : {
            all: "Все товары",
            products: "Выбранные товары",
            variants: "Выбранные фасовки",
            categories: "Выбранные категории",
          }[terms.scope.type]),
    terms.minimumMinor && `От ${formatMinor(terms.minimumMinor, currency)}`,
    terms.minimumQuantity && `От ${terms.minimumQuantity} ед.`,
    (terms.confirmed || (terms.personalLimit && terms.purchase?.mode !== "exact")) && "Подтверждённый покупатель",
  ]
    .filter(Boolean)
    .join(" · ");
}

const promoTile = `${interactive} block w-full rounded-xl bg-card p-4 text-left`;
export function OfferTile({ offer, currency, onClick }: { offer: PromoOffer; currency: string; onClick: () => void }) {
  const { terms } = offer;
  const Icon = terms.kind === "code" ? Tag : Percent;
  return (
    <button type="button" className={promoTile} onClick={onClick}>
      <span className="flex items-start gap-2">
        <Icon size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 wrap-anywhere text-label">{terms.name || "Без названия"}</span>
        <PromoBadge status={offer.status} />
      </span>
      <span className="mt-1.5 block wrap-anywhere text-small text-muted-foreground">
        {promoConditions(terms, currency)}
      </span>
      {(terms.totalLimit || personalLimit(terms)) && (
        <span className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1 text-small">
          {!!terms.totalLimit && (
            <span className="font-semibold">
              Осталось {Math.max(0, terms.totalLimit - offer.used)} из {terms.totalLimit}
            </span>
          )}
          {personalLimit(terms) && <span className="text-muted-foreground">{personalLimit(terms)}</span>}
        </span>
      )}
      {!!offer.orders && (
        <span className="mt-2 block text-small font-semibold">
          {offer.orders} {ruPlural(offer.orders, "заказ", "заказа", "заказов")} · скидок на{" "}
          {formatMinor(offer.savingsMinor, currency)}
        </span>
      )}
    </button>
  );
}

export function PromoPhoto(props: Pick<ComponentProps<typeof ProductImage>, "src"> & { className?: string }) {
  return <ProductImage {...props} alt="" fallback={<ImageOff size={28} aria-hidden="true" />} />;
}

export function PromoPriceTile({
  price,
  currency,
  onClick,
}: {
  price: PromoPrice;
  currency: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className={promoTile}>
      <span className="flex items-start gap-3">
        <PromoPhoto src={price.image?.src} className="w-16 shrink-0" />
        <span className="min-w-0 space-y-1">
          <span className="block wrap-anywhere text-label">{price.productName}</span>
          {price.variantName && (
            <span className="block wrap-anywhere text-meta text-muted-foreground">{price.variantName}</span>
          )}
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-title-3 text-primary-text">{formatMinor(price.priceMinor, currency)}</span>
            <del className="text-meta text-muted-foreground">{formatMinor(price.oldPriceMinor, currency)}</del>
          </span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-muted-foreground">
            <PromoBadge status={price.status} />
            {price.fromDate || price.throughDate
              ? promoPeriod(price.fromDate, price.throughDate)
              : "Без даты окончания"}
          </span>
        </span>
      </span>
    </button>
  );
}
