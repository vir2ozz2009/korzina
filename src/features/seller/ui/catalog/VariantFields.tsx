import { type ReactNode, useState } from "react";
import type { SellerProductInput, SellerVariant } from "../../../../shared/contracts/seller-catalog";
import { minorInput, parseMinorInput } from "../../../../shared/money";
import { Button } from "../../../../ui/Button";
import { Card } from "../../../../ui/Card";
import { Input } from "../../../../ui/Input";
import { Sheet } from "../../../../ui/Sheet";
import { Switch } from "../../../../ui/Switch";
import { type PricePromoContext, VariantPricePromo } from "./VariantPricePromo";

export type VariantDraft = {
  key: string;
  id?: string;
  name: string;
  price: string;
  oldPrice: string;
  promoDates?: SellerProductInput["variants"][number]["promoDates"];
  promoStartsAt?: number | null;
  promoEndsAt?: number | null;
  stock: string;
  unlimited: boolean;
  visible: boolean;
  pause?: "tomorrow" | "manual" | "resume";
  salePause: number | null;
  baseline?: SellerProductInput["variants"][number]["stockBaseline"];
};
export function variantDraft(currency: string, row?: SellerVariant): VariantDraft {
  return {
    key: row?.id ?? crypto.randomUUID(),
    id: row?.id,
    name: row?.name ?? "",
    price: row ? minorInput(row.priceMinor, currency) : "",
    oldPrice: row?.oldPriceMinor == null ? "" : minorInput(row.oldPriceMinor, currency),
    promoStartsAt: row?.promoStartsAt,
    promoEndsAt: row?.promoEndsAt,
    stock: row?.stock == null ? "" : String(row.stock),
    unlimited: row?.stock === null,
    visible: row?.visible ?? true,
    salePause: row?.salePause ?? null,
    baseline: row ? { stock: row.stock, revision: row.stockRevision, purchased: row.purchased } : undefined,
  };
}

export function variantInput(row: VariantDraft, currency: string) {
  const priceMinor = parseMinorInput(row.price, currency);
  const oldPriceMinor = row.oldPrice ? parseMinorInput(row.oldPrice, currency) : null;
  if (priceMinor === undefined || oldPriceMinor === undefined) throw new Error("Укажите корректную цену");
  if (!row.unlimited && (!/^\d+$/u.test(row.stock) || !Number.isSafeInteger(Number(row.stock))))
    throw new Error("Укажите остаток целым числом от 0 или выберите «Без лимита»");
  return {
    id: row.id,
    name: row.name,
    priceMinor,
    oldPriceMinor,
    ...(row.promoDates !== undefined && { promoDates: row.promoDates }),
    visible: row.visible,
    stock: row.unlimited ? null : Number(row.stock),
    stockBaseline: row.baseline,
    pause: row.pause,
  };
}

export function VariantFields({
  row,
  patch,
  multiple,
  disabled,
  sale,
  error,
  promotion,
  promoHeading,
}: {
  row: VariantDraft;
  patch: (draft: Partial<VariantDraft>) => void;
  multiple: boolean;
  disabled: boolean;
  sale?: boolean;
  error?: string;
  promotion?: PricePromoContext;
  promoHeading?: ReactNode;
}) {
  const [showPause, setShowPause] = useState(false);
  const inSale =
    row.visible &&
    (row.unlimited || Number(row.stock) > 0) &&
    (row.pause === "resume" || (!row.pause && row.salePause === null));
  const nameField = multiple && (
    <Input
      label="Название фасовки"
      value={row.name}
      maxLength={120}
      disabled={disabled}
      error={error}
      onChange={(event) => patch({ name: event.target.value })}
    />
  );
  const stockFields = (
    <>
      {promoHeading && nameField}
      <Input
        label="Остаток"
        value={row.stock}
        inputMode="numeric"
        disabled={disabled || row.unlimited}
        onChange={(event) => patch({ stock: event.target.value })}
      />
      <Switch
        label="Без лимита"
        checked={row.unlimited}
        disabled={disabled}
        onChange={(event) => patch({ unlimited: event.target.checked })}
      />
      {multiple && (
        <Switch
          label="Показывать фасовку"
          checked={row.visible}
          disabled={disabled}
          onChange={(event) => patch({ visible: event.target.checked })}
        />
      )}
      {sale && row.visible && (
        <Switch
          label="В продаже"
          checked={inSale}
          disabled={disabled}
          onChange={() => {
            if (inSale) setShowPause(true);
            else if (row.unlimited || Number(row.stock) > 0) patch({ pause: "resume" });
            else setShowPause(true);
          }}
        />
      )}
    </>
  );
  return (
    <>
      {!promoHeading && nameField}
      {promotion ? (
        <VariantPricePromo {...promotion} row={row} patch={patch} disabled={disabled} heading={promoHeading} />
      ) : (
        <>
          <Input
            label="Цена"
            value={row.price}
            inputMode="decimal"
            disabled={disabled}
            onChange={(event) => patch({ price: event.target.value })}
          />
          <Input
            label="Старая цена"
            value={row.oldPrice}
            inputMode="decimal"
            disabled={disabled}
            onChange={(event) => patch({ oldPrice: event.target.value })}
          />
        </>
      )}
      {promoHeading ? <Card>{stockFields}</Card> : stockFields}
      {showPause && (
        <Sheet open title={inSale ? "Снять с продажи" : "Сколько есть?"} onOpenChange={setShowPause} form>
          <div className="space-y-2">
            {inSale ? (
              (["tomorrow", "manual"] as const).map((duration) => (
                <Button
                  key={duration}
                  full
                  variant="secondary"
                  onClick={() => {
                    patch({ pause: duration });
                    setShowPause(false);
                  }}
                >
                  {duration === "tomorrow" ? "До завтра" : "Пока не верну"}
                </Button>
              ))
            ) : (
              <>
                <Input
                  label="Количество"
                  value={row.stock}
                  inputMode="numeric"
                  onChange={(event) => patch({ stock: event.target.value })}
                />
                <Button variant="secondary" onClick={() => patch({ unlimited: true })}>
                  Без лимита
                </Button>
                <Button
                  full
                  disabled={!row.unlimited && !(Number(row.stock) > 0)}
                  onClick={() => {
                    patch({ pause: "resume" });
                    setShowPause(false);
                  }}
                >
                  Вернуть в продажу
                </Button>
              </>
            )}
          </div>
        </Sheet>
      )}
    </>
  );
}
