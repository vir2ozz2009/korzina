import { type PromoStatus, promoStatuses } from "../../../../shared/contracts/promo";
import { formatMinor } from "../../../../shared/money";
import { Button } from "../../../../ui/Button";
import { Card } from "../../../../ui/Card";
import { ListItem } from "../../../../ui/ListItem";
import { Price } from "../../../../ui/Price";
import { ProductImage } from "../../../../ui/ProductImage";
import type { PromoList as ListData } from "./api";
export const statusTitle: Record<PromoStatus, string> = {
  active: "Действует",
  scheduled: "Запланировано",
  draft: "Черновик",
  ended: "Завершено",
  disabled: "Отключено",
};
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
  image,
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
  image: (id: string) => string;
}) {
  return (
    <>
      <Button full onClick={create}>
        Создать акцию
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <label>
          <select
            aria-label="Вид акции"
            className="min-h-12 w-full rounded-lg border border-border bg-card px-2"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">Все виды</option>
            <option value="automatic">Автоскидки</option>
            <option value="code">Промокоды</option>
            <option value="price">Цена по акции</option>
          </select>
        </label>
        <label>
          <select
            aria-label="Статус акции"
            className="min-h-12 w-full rounded-lg border border-border bg-card px-2"
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
          </select>
        </label>
      </div>
      {data?.offers.map((offer) => (
        <ListItem
          key={offer.id}
          title={offer.terms.name || "Без названия"}
          subtitle={`${statusTitle[offer.status]}${offer.terms.totalLimit ? ` · Осталось ${Math.max(0, offer.terms.totalLimit - offer.used)} из ${offer.terms.totalLimit}` : ""}${offer.orders ? ` · ${offer.orders} заказов · скидок на ${formatMinor(offer.savingsMinor, currency)}` : ""}`}
          onClick={() => open(offer.id)}
        />
      ))}
      {data?.prices?.map((price) => (
        <ListItem
          key={price.variantId}
          title={[price.productName, price.variantName].filter(Boolean).join(" · ")}
          icon={price.photoId ? <ProductImage src={image(price.photoId)} alt="" className="w-12" /> : undefined}
          subtitle={`${statusTitle[price.status]} · ${[price.fromDate, price.throughDate].filter(Boolean).join(" — ") || "Без даты окончания"}`}
          value={<Price amountMinor={price.priceMinor} oldMinor={price.oldPriceMinor} currency={currency} />}
          onClick={() => openProduct(price.productId, price.variantId)}
        />
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
