import { Plus } from "lucide-react";
import { promoStatuses } from "../../../../shared/contracts/promo";
import { Button } from "../../../../ui/Button";
import { Card } from "../../../../ui/Card";
import { SelectField } from "../../../../ui/SelectField";
import type { PromoList as ListData } from "./api";
import { OfferTile, PromoPriceTile, statusTitle } from "./PromoPresentation";

export function PromoList({
  data,
  kind,
  status,
  offset,
  currency,
  setKind,
  setStatus,
  setOffset,
  create,
  open,
  openProduct,
}: {
  data?: ListData;
  kind: string;
  status: string;
  offset: number;
  currency: string;
  setKind: (value: string) => void;
  setStatus: (value: string) => void;
  setOffset: (value: number) => void;
  create: () => void;
  open: (id: string) => void;
  openProduct: (id: string, variant?: string) => void;
}) {
  return (
    <>
      <Button full size="lg" icon={<Plus size={18} aria-hidden="true" />} onClick={create}>
        Создать акцию
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <SelectField
          aria-label="Вид акции"
          surface="transparent"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            setOffset(0);
          }}
        >
          <option value="">Все виды</option>
          <option value="automatic">Скидки</option>
          <option value="code">Промокоды</option>
          <option value="price">Цены по акции</option>
        </SelectField>
        <SelectField
          aria-label="Статус акции"
          surface="transparent"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setOffset(0);
          }}
        >
          <option value="">Все статусы</option>
          {promoStatuses.map((value) => (
            <option key={value} value={value}>
              {statusTitle[value]}
            </option>
          ))}
        </SelectField>
      </div>
      {data?.offers
        .filter((offer) => offer.status === "active")
        .map((offer) => (
          <OfferTile key={offer.id} offer={offer} currency={currency} onClick={() => open(offer.id)} />
        ))}
      {data?.prices
        ?.filter((price) => price.status === "active")
        .map((price) => (
          <PromoPriceTile
            key={price.variantId}
            price={price}
            currency={currency}
            onClick={() => openProduct(price.productId, price.variantId)}
          />
        ))}
      {data?.offers
        .filter((offer) => offer.status === "scheduled")
        .map((offer) => (
          <OfferTile key={offer.id} offer={offer} currency={currency} onClick={() => open(offer.id)} />
        ))}
      {data?.prices
        ?.filter((price) => price.status === "scheduled")
        .map((price) => (
          <PromoPriceTile
            key={price.variantId}
            price={price}
            currency={currency}
            onClick={() => openProduct(price.productId, price.variantId)}
          />
        ))}
      {data?.offers
        .filter((offer) => offer.status !== "active" && offer.status !== "scheduled")
        .map((offer) => (
          <OfferTile key={offer.id} offer={offer} currency={currency} onClick={() => open(offer.id)} />
        ))}
      {!data?.offers.length &&
        !data?.prices?.length &&
        (kind || status ? (
          <Button
            variant="secondary"
            onClick={() => {
              setKind("");
              setStatus("");
              setOffset(0);
            }}
          >
            Сбросить фильтры
          </Button>
        ) : (
          <Card>Акций пока нет</Card>
        ))}
      {!!offset && (
        <Button variant="secondary" onClick={() => setOffset(Math.max(0, offset - 30))}>
          Назад
        </Button>
      )}
      {data?.nextOffset != null && (
        <Button variant="secondary" onClick={() => setOffset(data?.nextOffset ?? 0)}>
          Далее
        </Button>
      )}
    </>
  );
}
