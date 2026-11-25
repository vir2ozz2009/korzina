import { useState } from "react";
import { calendarDate, shopDateTime } from "../../../../shared/datetime";
import { parseMinorInput } from "../../../../shared/money";
import { Button } from "../../../../ui/Button";
import { Input } from "../../../../ui/Input";
import { Price } from "../../../../ui/Price";
import { ProductRow } from "../../../../ui/ProductRow";
import { ProductTile } from "../../../../ui/ProductTile";
import { Sheet } from "../../../../ui/Sheet";
import type { VariantDraft } from "./VariantFields";

export function VariantPricePromo({
  row,
  patch,
  currency,
  zone,
  disabled,
}: {
  row: VariantDraft;
  patch: (draft: Partial<VariantDraft>) => void;
  currency: string;
  zone: string;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [moment, setMoment] = useState("during");
  const [timed, setTimed] = useState(Boolean(row.promoDates || row.promoStartsAt || row.promoEndsAt));
  const regular = parseMinorInput(row.oldPrice, currency);
  const discounted = parseMinorInput(row.price, currency);
  const valid = regular !== undefined && discounted !== undefined && discounted < regular;
  const promo = moment === "during" || !timed;
  const price = { amountMinor: (promo ? discounted : regular) ?? 0, oldMinor: promo ? regular : undefined, currency };
  const from =
    row.promoDates === undefined && row.promoStartsAt
      ? shopDateTime(row.promoStartsAt, zone).date
      : (row.promoDates?.fromDate ?? "");
  const through =
    row.promoDates === undefined && row.promoEndsAt
      ? calendarDate(shopDateTime(row.promoEndsAt, zone).date, -1)
      : (row.promoDates?.throughDate ?? "");
  return (
    <>
      <label className="block">
        Срок · {zone}
        <select
          className="min-h-12 w-full rounded-lg border border-border bg-card px-3"
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
        </select>
      </label>
      {timed && (
        <>
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
      <Button full variant="secondary" disabled={!valid} onClick={() => setOpen(true)}>
        Как увидит покупатель
      </Button>
      <Sheet open={open} title="Как увидит покупатель" onOpenChange={setOpen}>
        <div className="space-y-3">
          {timed && (
            <div className="grid grid-cols-3 gap-2">
              {[
                ["before", "До акции"],
                ["during", "Во время"],
                ["after", "После акции"],
              ].map(([value, label]) => (
                <Button
                  key={value}
                  variant={moment === value ? "primary" : "secondary"}
                  onClick={() => setMoment(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
          )}
          <p>Плитка товара</p>
          <div inert className="max-w-44">
            <ProductTile
              {...price}
              name={row.name || "Товар"}
              unit=""
              href="#"
              cart={{ value: 0, max: 1, onChange: () => {} }}
            />
          </div>
          <p>Карточка товара</p>
          <Price {...price} size="display" />
          <p>Корзина</p>
          <ProductRow {...price} variant="order" name={row.name || "Товар"} unit="" quantity={1} />
          <Button full variant="secondary" onClick={() => setOpen(false)}>
            Изменить
          </Button>
        </div>
      </Sheet>
    </>
  );
}
