import type { Cart } from "../../../shared/contracts/cart";
import type { PublicPromo } from "../../../shared/contracts/promo";
import { formatMinor, fromBasisPoints } from "../../../shared/money";
import { Button } from "../../../ui/Button";
import { ListItem } from "../../../ui/ListItem";

export type PublicOffers = {
  offers: PublicPromo[];
  zone: string;
  failed: boolean;
  refresh: () => void;
};

export function PublicCartPromos({
  offers,
  selected,
  currency,
  zone,
  open,
  apply,
  pending,
}: {
  offers: PublicPromo[];
  selected?: string;
  currency: string;
  zone: string;
  open: (id: string) => void;
  apply: (offer: PublicPromo) => void;
  pending: boolean;
}) {
  const money = (value: number) => formatMinor(value, currency);
  const benefit = ({ discount }: PublicPromo) =>
    discount.type === "fixed" ? money(discount.value) : `${fromBasisPoints(discount.value)}%`;
  const offer = offers.find(({ id }) => id === selected);
  if (selected && !offer) return <p role="status">Акция больше недоступна. Проверьте условия.</p>;
  if (!offer) {
    return offers.length > 0 ? (
      offers.map((item) => (
        <ListItem
          key={item.id}
          variant="compact"
          title={item.name}
          subtitle={`Скидка ${benefit(item)}`}
          onClick={() => open(item.id)}
        />
      ))
    ) : (
      <p>Пока нет доступных акций</p>
    );
  }
  const { discount, scopeNames, minimumMinor, minimumQuantity, fromDate, throughDate, purchase } = offer;
  return (
    <>
      <h3 className="text-title-3 wrap-anywhere">{offer.name}</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-caption [&_dd]:text-right [&_dd]:wrap-anywhere">
        <dt>Способ</dt>
        <dd>{offer.kind === "code" ? `Промокод ${offer.code}` : "Автоматически"}</dd>
        <dt>Товары</dt>
        <dd>{scopeNames.join(", ") || "Выбранные товары"}</dd>
        <dt>Скидка</dt>
        <dd>{benefit(offer)}</dd>
        {discount.type === "percent" && discount.capMinor && (
          <>
            <dt>Максимум</dt>
            <dd>{money(discount.capMinor)}</dd>
          </>
        )}
        {minimumMinor && (
          <>
            <dt>От суммы</dt>
            <dd>{money(minimumMinor)}</dd>
          </>
        )}
        {minimumQuantity && (
          <>
            <dt>Количество</dt>
            <dd>От {minimumQuantity} шт.</dd>
          </>
        )}
        <dt>Срок</dt>
        <dd>
          {fromDate || "Сразу"} · {throughDate ? `по ${throughDate} включительно` : "без срока"} · {zone}
        </dd>
        {(offer.confirmed || purchase || offer.personalLimit) && (
          <>
            <dt>Покупатель</dt>
            <dd>Подтверждённый · Telegram</dd>
          </>
        )}
        {purchase && (
          <>
            <dt>Покупка</dt>
            <dd>
              {purchase.mode === "exact" ? "Только" : "Начиная с"} №{purchase.number}
            </dd>
          </>
        )}
        {offer.personalLimit && (
          <>
            <dt>Ограничение</dt>
            <dd>До {offer.personalLimit} на покупателя</dd>
          </>
        )}
      </dl>
      {offer.missingMinor && <p>Добавьте подходящих товаров ещё на {money(offer.missingMinor)}</p>}
      {offer.missingQuantity && <p>Добавьте подходящие товары · ещё {offer.missingQuantity} шт.</p>}
      {offer.code && (
        <Button full disabled={!offer.applicable} loading={pending} onClick={() => apply(offer)}>
          Применить
        </Button>
      )}
    </>
  );
}

export function PublicPromoTriggers({
  publicOffers,
  hint,
  currency,
  open,
}: {
  publicOffers?: PublicOffers;
  hint?: NonNullable<Cart["promo"]>["hint"];
  currency: string;
  open: (id?: string) => void;
}) {
  return (
    <>
      {publicOffers && publicOffers.offers.length > 0 && (
        <ListItem
          variant="compact"
          title="Доступные акции"
          onClick={() => {
            open();
          }}
        />
      )}
      {publicOffers?.failed && (
        <p role="status" className="text-small text-muted-foreground">
          Акции пока недоступны. Промокод можно ввести вручную.{" "}
          <button type="button" className="min-h-11 underline" onClick={publicOffers.refresh}>
            Повторить
          </button>
        </p>
      )}
      {hint && (
        <p className="text-caption text-muted-foreground">
          {publicOffers?.offers.some(({ id }) => id === hint?.publicOfferId) ? (
            <button
              type="button"
              className="min-h-11 text-left text-primary-strong underline"
              onClick={() => {
                open(hint.publicOfferId);
              }}
            >
              Ещё {formatMinor(hint.missingMinor, currency)} до скидки · {hint.label}
            </button>
          ) : (
            <>
              Ещё {formatMinor(hint.missingMinor, currency)} до скидки · {hint.label}
            </>
          )}
        </p>
      )}
    </>
  );
}
