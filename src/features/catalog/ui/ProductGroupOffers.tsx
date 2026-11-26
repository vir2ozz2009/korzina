import type { CatalogGroupPromo } from "../../../shared/contracts/catalog";
import { formatMinor } from "../../../shared/money";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";

export function ProductGroupOffers({
  offers,
  currency,
  blocked,
  add,
}: {
  offers: CatalogGroupPromo[];
  currency: string;
  blocked: boolean;
  add: (parts: { variantId: string; quantity: number }[]) => void;
}) {
  return offers.map((offer) => (
    <Card key={offer.id}>
      {offer.type === "gift" ? (
        <>
          <h2 className="text-title-3">
            {offer.buy + offer.gift} по цене {offer.buy}
          </h2>
          <p>
            Купите {offer.buy} · {offer.gift} в подарок
          </p>
        </>
      ) : (
        <>
          <h2 className="text-title-3">Комбо-набор «{offer.name}»</h2>
          <ul>
            {offer.components.map(({ variantId, name, unit, quantity }) => (
              <li key={variantId}>
                {[name, unit].filter(Boolean).join(" · ")} × {quantity}
              </li>
            ))}
          </ul>
          <p>{formatMinor(offer.priceMinor, currency)}</p>
          {offer.limit && (
            <p>
              До {offer.limit} {offer.limit === 1 ? "набора" : "наборов"} по этой цене за заказ
            </p>
          )}
          {offer.code && <p>По промокоду {offer.code}</p>}
          <Button
            variant="secondary"
            disabled={blocked}
            onClick={() => add(offer.components.map(({ variantId, quantity }) => ({ variantId, quantity })))}
          >
            Добавить набор
          </Button>
        </>
      )}
    </Card>
  ));
}
