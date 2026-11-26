import type { ReactNode } from "react";
import { useId, useState } from "react";
import { calendarDate, shopDateTime } from "../../../../shared/datetime";
import { currencyUnit, formatMinor, parseMinorInput } from "../../../../shared/money";
import { Button } from "../../../../ui/Button";
import { Card } from "../../../../ui/Card";
import { Input } from "../../../../ui/Input";
import { Price } from "../../../../ui/Price";
import { ProductImage } from "../../../../ui/ProductImage";
import { ProductRow } from "../../../../ui/ProductRow";
import { ProductTile } from "../../../../ui/ProductTile";
import { SelectField } from "../../../../ui/SelectField";
import { Sheet } from "../../../../ui/Sheet";
import { PromoSelect } from "../promo/PromoSelect";
import type { VariantDraft } from "./VariantFields";

export type PricePromoContext = {
  currency: string;
  zone: string;
  product: { name: string; image?: string };
  save: () => void;
  busy: boolean;
  error?: string;
};

export function VariantPricePromo({
  row,
  patch,
  currency,
  zone,
  product,
  disabled,
  heading,
  save,
  busy,
  error,
}: {
  row: VariantDraft;
  patch: (draft: Partial<VariantDraft>) => void;
  disabled: boolean;
  heading?: ReactNode;
} & PricePromoContext) {
  const currencyLabel = currencyUnit(currency);
  const periodId = useId();
  const [open, setOpen] = useState(false);
  const [moment, setMoment] = useState("during");
  const [timed, setTimed] = useState(Boolean(row.promoDates || row.promoStartsAt || row.promoEndsAt));
  const regular = parseMinorInput(row.oldPrice, currency);
  const discounted = parseMinorInput(row.price, currency);
  const valid = regular !== undefined && discounted !== undefined && discounted < regular;
  const promo = moment === "during";
  const price = { amountMinor: (promo ? discounted : regular) ?? 0, oldMinor: promo ? regular : undefined, currency };
  const from =
    row.promoDates === undefined && row.promoStartsAt
      ? shopDateTime(row.promoStartsAt, zone).date
      : (row.promoDates?.fromDate ?? "");
  const through =
    row.promoDates === undefined && row.promoEndsAt
      ? calendarDate(shopDateTime(row.promoEndsAt, zone).date, -1)
      : (row.promoDates?.throughDate ?? "");
  const name = product.name.trim() || "Товар";
  const unit = row.name.trim();
  const listing = { ...price, name, unit, image: product.image };
  const prices = (
    <>
      {heading}
      <Input
        label="Обычная цена"
        value={row.oldPrice}
        inputMode="decimal"
        hint={`${currencyLabel} · валюта магазина`}
        disabled={disabled}
        onChange={(event) => patch({ oldPrice: event.target.value })}
      />
      <Input
        label={heading || row.oldPrice ? "Цена по акции" : "Цена"}
        value={row.price}
        inputMode="decimal"
        hint={heading || row.oldPrice ? `${currencyLabel} · ниже обычной цены` : undefined}
        disabled={disabled}
        onChange={(event) => patch({ price: event.target.value })}
      />
      <div className="space-y-1.5">
        <label htmlFor={periodId} className="block text-label">
          Срок
        </label>
        <SelectField
          id={periodId}
          disabled={disabled}
          value={timed ? "dates" : ""}
          onChange={(event) => {
            setTimed(!!event.target.value);
            patch({
              promoDates: event.target.value
                ? { fromDate: from || undefined, throughDate: through || undefined }
                : null,
            });
          }}
        >
          <option value="">Без срока</option>
          <option value="dates">Указать даты</option>
        </SelectField>
      </div>
      {timed && (
        <>
          <p className="text-small text-muted-foreground">Часовой пояс · {zone}</p>
          <Input
            type="date"
            label="Начало"
            disabled={disabled}
            value={from}
            onChange={(event) =>
              patch({
                promoDates: { fromDate: event.target.value || undefined, throughDate: through || undefined },
              })
            }
          />
          <Input
            type="date"
            label="По дату включительно"
            disabled={disabled}
            value={through}
            onChange={(event) =>
              patch({
                promoDates: { fromDate: from || undefined, throughDate: event.target.value || undefined },
              })
            }
          />
        </>
      )}
    </>
  );
  return (
    <>
      {heading ? <Card>{prices}</Card> : prices}
      <Button
        full
        size={heading ? "lg" : "md"}
        variant={heading ? "primary" : "secondary"}
        disabled={!valid || disabled}
        onClick={() => {
          setMoment("during");
          setOpen(true);
        }}
      >
        Как увидит покупатель
      </Button>
      <Sheet
        open={open}
        title="Как увидит покупатель"
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
        onBack={() => {
          if (!busy) setOpen(false);
        }}
        screen
      >
        <div className="space-y-3">
          <Card>
            <PromoSelect
              label="Когда смотрит покупатель"
              value={moment}
              onChange={(event) => setMoment(event.target.value)}
            >
              <option value="before">До</option>
              <option value="during">Во время</option>
              <option value="after">После</option>
            </PromoSelect>
            {timed && (from || through) && (
              <p className="text-caption text-muted-foreground">
                {moment === "before" && from
                  ? `До 00:00 ${from}`
                  : moment === "after" && through
                    ? `С 00:00 ${calendarDate(through, 1)}`
                    : [from && `С ${from}`, through && `по ${through} включительно`].filter(Boolean).join(" ")}{" "}
                · {zone}
              </p>
            )}
          </Card>
          <Card>
            <h3 className="text-title-3">Плитка товара</h3>
            <div inert className="max-w-44">
              <ProductTile {...listing} href="#" cart={{ value: 0, max: 1, onChange: () => {} }} />
            </div>
          </Card>
          <Card>
            <h3 className="text-title-3">Карточка товара</h3>
            <ProductImage src={product.image} alt="" className="w-24" />
            <p className="text-title-2 wrap-anywhere">{name}</p>
            {unit && <p className="text-caption text-muted-foreground">{unit}</p>}
            <Price {...price} size="display" />
          </Card>
          <Card>
            <h3 className="text-title-3">Строка корзины</h3>
            <div inert>
              <ProductRow
                name={name}
                unit={unit}
                image={product.image}
                amountMinor={price.amountMinor}
                currency={currency}
                previous={price.oldMinor == null ? undefined : formatMinor(price.oldMinor, currency)}
                variant="cart"
                quantity={1}
              />
            </div>
          </Card>
          <Card>
            <h3 className="text-title-3">Перед сохранением</h3>
            <p className="text-label wrap-anywhere">{name}</p>
            <p className="text-caption wrap-anywhere">{unit}</p>
            <div className="flex justify-between gap-2">
              <span>Обычная цена</span>
              <strong>{formatMinor(regular ?? 0, currency)}</strong>
            </div>
            <div className="flex justify-between gap-2">
              <span>Цена по акции</span>
              <strong>{formatMinor(discounted ?? 0, currency)}</strong>
            </div>
            <p className="text-caption">
              {from || through
                ? [from && `с ${from}`, through && `по ${through} включительно`, zone].filter(Boolean).join(" · ")
                : "Без срока"}
            </p>
          </Card>
          {error && (
            <p role="alert" className="text-status-danger-foreground">
              {error}
            </p>
          )}
          <Button full size="lg" loading={busy} disabled={disabled} onClick={save}>
            Сохранить
          </Button>
          <Button full variant="secondary" disabled={busy} onClick={() => setOpen(false)}>
            Изменить
          </Button>
        </div>
      </Sheet>
    </>
  );
}
