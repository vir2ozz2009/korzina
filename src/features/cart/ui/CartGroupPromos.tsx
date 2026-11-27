import { useBlocker } from "@tanstack/react-router";
import { Gift } from "lucide-react";
import type { RefObject } from "react";
import type { Cart, CartAdjustment } from "../../../shared/contracts/cart";
import { formatMinor } from "../../../shared/money";
import { ruPlural } from "../../../shared/ru-plural";
import { Button } from "../../../ui/Button";
import { Sheet } from "../../../ui/Sheet";

type Hint = NonNullable<NonNullable<Cart["promo"]>["groupHints"]>[number];
type Allocation = NonNullable<CartAdjustment["allocations"]>[number];

export function CartGiftHints({
  hints,
  variantId,
  blocked,
  add,
}: {
  hints?: Hint[];
  variantId: string;
  blocked: boolean;
  add?: (items: Hint["missing"]) => void;
}) {
  return hints?.map((hint) => {
    const item = hint.missing[0];
    if (hint.type !== "gift" || item?.variantId !== variantId || !hint.giftQuantity) return null;
    return (
      <div className="mt-2 space-y-1" key={hint.id}>
        <p className="text-caption">
          Добавьте ещё {item.quantity} ({item.unit}) — {hint.giftQuantity} в подарок
        </p>
        {add && (
          <Button variant="secondary" disabled={blocked} onClick={() => add(hint.missing)}>
            Добавить {item.quantity}
          </Button>
        )}
      </div>
    );
  });
}

export function CartGroupPromos({
  cart,
  currency,
  blocked,
  add,
  open,
}: {
  cart: Cart;
  currency: string;
  blocked: boolean;
  add?: (items: Hint["missing"]) => void;
  open: (adjustment: CartAdjustment, trigger: HTMLButtonElement) => void;
}) {
  const bundles = cart.adjustments.filter(({ groups }) => groups?.type === "bundle");
  const hints = cart.promo?.groupHints?.filter((hint) => hint.type === "bundle");
  if (!bundles.length && !hints?.length) return null;
  const money = (value: number) => formatMinor(value, currency);
  return (
    <div className="space-y-3">
      {bundles.map((item) => {
        if (!item.groups) return null;
        const { count, possible, limit } = item.groups;
        const capped = limit && possible > count;
        const sets = capped
          ? `${count} из ${possible} наборов по акции. Лимит — ${limit} на заказ`
          : limit === count && count > 1
            ? `${count} из ${limit} наборов по акции`
            : `${count} ${ruPlural(count, "набор", "набора", "наборов")} по акции`;
        return (
          <button
            key={item.sourceId}
            type="button"
            className="block min-h-11 text-left text-caption text-primary-text underline"
            onClick={(event) => open(item, event.currentTarget)}
          >
            {item.label} · {sets} · экономия {money(-item.amount)}
          </button>
        );
      })}
      {hints?.map((hint) => {
        const list = hint.missing
          .map(({ quantity, name, unit }) => [name, unit, quantity > 1 && `× ${quantity}`].filter(Boolean).join(" · "))
          .join(", ");
        return (
          <div className="space-y-1" key={`${hint.id}-${hint.missing.map(({ variantId }) => variantId).join(",")}`}>
            <p className="text-caption">
              {hint.unavailable
                ? "Набор недоступен: одной из фасовок нет в наличии"
                : hint.remainingSets
                  ? `Можно собрать ещё ${hint.remainingSets} ${ruPlural(hint.remainingSets, "набор", "набора", "наборов")} по ${money(hint.priceMinor ?? 0)}`
                  : `Для набора не хватает: ${list}`}
            </p>
            {!!hint.savingsMinor && hint.priceMinor !== undefined && (
              <p className="text-caption">
                Набор будет стоить {money(hint.priceMinor)} вместо {money(hint.priceMinor + hint.savingsMinor)}.
                Экономия {money(hint.savingsMinor)}.{hint.code && ` По промокоду ${hint.code}.`}
              </p>
            )}
            {add && hint.missing.length > 0 && (
              <Button variant="secondary" disabled={blocked} onClick={() => add(hint.missing)}>
                {hint.missing.length === 1 ? `Добавить ${hint.missing[0].name}` : "Добавить недостающее"}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function CartGroupDetails({
  adjustment,
  part,
  cart,
  currency,
  close,
  returnFocus,
}: {
  adjustment?: CartAdjustment;
  part?: Allocation;
  cart?: Cart;
  currency?: string | null;
  close: () => void;
  returnFocus: RefObject<HTMLElement | null>;
}) {
  useBlocker({
    disabled: !adjustment,
    enableBeforeUnload: false,
    shouldBlockFn: ({ action }) => {
      if (action !== "BACK" && action !== "GO") return false;
      close();
      return true;
    },
  });
  const bundle = adjustment?.groups?.type === "bundle";
  const group = adjustment?.groups;
  return (
    <Sheet
      returnFocus={returnFocus}
      open={!!adjustment}
      title={bundle ? adjustment.label : "Почему такая сумма"}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      {bundle &&
        group &&
        currency &&
        (group.bundle ? (
          <>
            {group.count > 1 && <p className="text-caption">В одном наборе</p>}
            {group.bundle.components.map((entry) => (
              <p key={entry.variantId}>
                {entry.name} · {entry.unit} × {entry.quantity}
              </p>
            ))}
            {group.count === 1 ? (
              <p className="text-title-3">За набор — {formatMinor(group.bundle.totalMinor, currency)}</p>
            ) : (
              <>
                <p>
                  {group.count} {ruPlural(group.count, "набор", "набора", "наборов")} ×{" "}
                  {formatMinor(group.bundle.priceMinor, currency)}
                </p>
                <p className="text-title-3">Стоимость наборов — {formatMinor(group.bundle.totalMinor, currency)}</p>
              </>
            )}
            <p>Экономия {formatMinor(-adjustment.amount, currency)}</p>
            {group.limit && group.count >= group.limit && group.possible > group.count && (
              <p className="text-caption">
                По акции {group.count} из {group.possible} наборов
              </p>
            )}
          </>
        ) : (
          <p role="status">Проверяем корзину…</p>
        ))}
      {!bundle && adjustment?.groups && (
        <>
          <h3 className="flex items-center gap-2 text-title-3">
            {adjustment.groups.type === "gift" ? (
              <>
                <Gift size={18} aria-hidden /> Количество в подарок
              </>
            ) : (
              adjustment.label
            )}
          </h3>
          <p className="flex justify-between gap-2">
            {" "}
            {adjustment.groups.type === "gift" ? "Полных групп" : "Наборов по акции"}{" "}
            <span>{adjustment.groups.count}</span>
          </p>
        </>
      )}
      {!bundle &&
        currency &&
        adjustment &&
        (part ? [part] : (adjustment.allocations ?? [])).map((entry) => {
          const line = cart?.lines.find(({ variantId }) => variantId === entry.variantId);
          return (
            <div key={entry.variantId} className="space-y-1">
              <h3 className="text-label">{[line?.name, line?.unit].filter(Boolean).join(" · ")}</h3>
              {entry.units
                ?.toSorted((a, b) => b.paidMinor - a.paidMinor)
                .map(({ quantity, paidMinor }) => (
                  <p key={paidMinor}>
                    {quantity}
                    {paidMinor === 0 && entry.gifts ? " в подарок" : ""} × {formatMinor(paidMinor, currency)}
                  </p>
                ))}
            </div>
          );
        })}
      {!bundle && currency && adjustment && (
        <p className="flex justify-between gap-2">
          Экономия <span>{formatMinor(part?.amount ?? -adjustment.amount, currency)}</span>
        </p>
      )}
      {!bundle && currency && cart && (
        <p className="flex justify-between gap-2 text-title-3">
          Итого за товары <span>{formatMinor(cart.totalMinor, currency)}</span>
        </p>
      )}
    </Sheet>
  );
}
