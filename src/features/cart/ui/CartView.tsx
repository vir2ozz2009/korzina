import { ChevronRight, X } from "lucide-react";
import { type ComponentProps, type ReactNode, useEffect, useRef, useState } from "react";
import { Screen } from "../../../app/shell/Screen";
import type { Cart, CartLine } from "../../../shared/contracts/cart";
import type { ReceivingAvailability } from "../../../shared/contracts/receiving";
import { formatMinor, multiplyMinor } from "../../../shared/money";
import { Card } from "../../../ui/Card";
import { Divider } from "../../../ui/Divider";
import { Header } from "../../../ui/Header";
import { IconButton } from "../../../ui/IconButton";
import { ProductRow } from "../../../ui/ProductRow";
import { deliveryLabel } from "../../receiving";
import { CartGiftHints, CartGroupDetails, CartGroupPromos } from "./CartGroupPromos";
import { CartNotice } from "./CartNotice";
import { CartPromotion } from "./CartPromotion";
import type { PublicOffers } from "./PublicCartPromos";

type Props = {
  cart?: Cart;
  query: NonNullable<ComponentProps<typeof Screen>["state"]>["query"];
  retry: () => void;
  addPromoItems?: ComponentProps<typeof CartGroupPromos>["add"];
  checking: boolean;
  confirmed?: boolean;
  pendingProducts?: ReadonlyMap<string, string>;
  change: (line: CartLine, quantity: number, currency: string, remove?: boolean) => void;
  openLine?: (line: CartLine) => void;
  back: () => void;
  onEmpty?: () => void;
  shipping: ReceivingAvailability | null;
  method?: "pickup" | "delivery" | null;
  total?: { deliveryMinor: number | null; totalMinor: number };
  promotion: ComponentProps<typeof CartPromotion>["mutation"];
  publicOffers?: PublicOffers;
  before?: ReactNode;
  after?: ReactNode;
  footer?: ReactNode;
};
export function CartView({
  cart,
  query,
  retry,
  addPromoItems,
  checking,
  confirmed = false,
  pendingProducts,
  change,
  openLine,
  back,
  onEmpty,
  shipping,
  method,
  total,
  promotion,
  publicOffers,
  before,
  after,
  footer,
}: Props) {
  const detailTrigger = useRef<HTMLElement | null>(null);
  const [detail, setDetail] = useState<{ sourceId: string; variantId?: string }>();
  const detailAdjustment = cart?.adjustments.find(({ sourceId }) => sourceId === detail?.sourceId);
  useEffect(() => {
    if (!detailAdjustment) setDetail(undefined);
  }, [detailAdjustment]);
  const currency = cart?.currency;
  const available = cart?.lines.filter((line) => line.available) ?? [];
  const courier =
    shipping?.mode === "delivery" && shipping.available && shipping.payee === "courier" && shipping.tariff !== "free";
  const late =
    method === "delivery" &&
    (total?.deliveryMinor === null ||
      (shipping?.mode === "delivery" && shipping.available && shipping.feeMinor === null));
  const unavailable = cart?.lines.filter((line) => !line.available) ?? [];
  const issues = new Map(cart?.review?.changes.map((issue) => [issue.variantId, issue]));
  const promoBlocked = checking || !!cart?.review || query.isError || !!pendingProducts?.size;
  function row(line: CartLine, currency: string) {
    const issue = issues.get(line.variantId);
    const pending = pendingProducts?.has(line.productId) ?? false;
    const previous = issue?.oldPriceMinor ?? line.oldPriceMinor;
    const amount = multiplyMinor(line.priceMinor, line.quantity);
    const savings =
      cart?.adjustments
        .flatMap((item) => item.allocations ?? [])
        .filter((part) => part.variantId === line.variantId)
        .reduce((sum, part) => sum + part.amount, 0) ?? 0;
    const gift = line.available
      ? cart?.adjustments.flatMap((item) =>
          (item.allocations ?? [])
            .filter((part) => part.variantId === line.variantId && part.gifts)
            .map((part) => ({ item, count: part.gifts ?? 0 })),
        )
      : undefined;
    const giftCount = gift?.reduce((sum, part) => sum + part.count, 0) ?? 0;
    return (
      <li key={line.variantId}>
        <ProductRow
          variant="cart"
          name={line.name}
          unit={line.unit}
          image={line.image ?? undefined}
          quantity={line.quantity}
          max={line.stock ?? 999}
          currency={currency}
          amountMinor={line.available ? (line.totalMinor ?? amount) : amount}
          previous={
            previous != null
              ? formatMinor(multiplyMinor(previous, line.quantity), currency)
              : savings
                ? formatMinor(amount, currency)
                : undefined
          }
          note={
            !line.available
              ? "Не учитывается"
              : issue?.remaining === undefined
                ? undefined
                : `Осталось ${issue.remaining}`
          }
          unavailable={!line.available}
          disabled={checking || pending || query.isError || !!cart?.review}
          removeDisabled={checking || pending}
          onChange={(quantity) => change(line, quantity, currency)}
          onRemove={() => change(line, 0, currency, true)}
          onOpen={openLine ? () => openLine(line) : undefined}
        />
        {giftCount > 0 && gift?.[0] && (
          <button
            type="button"
            className="mt-2 inline-flex min-h-11 items-center gap-1 rounded-pill bg-status-success px-3 text-small font-semibold text-status-success-foreground"
            onClick={(event) => {
              detailTrigger.current = event.currentTarget;
              setDetail({ sourceId: gift[0].item.sourceId, variantId: line.variantId });
            }}
          >
            {giftCount} в подарок <ChevronRight size={14} aria-hidden />
          </button>
        )}
        <CartGiftHints
          hints={line.available && !pending ? cart?.promo?.groupHints : undefined}
          variantId={line.variantId}
          blocked={promoBlocked}
          add={addPromoItems}
        />
      </li>
    );
  }
  return (
    <Screen
      template="checkout"
      header={
        <div className="bg-background px-3 pt-3 [&_header]:rounded-xl">
          <Header
            title="Корзина"
            headingLevel={1}
            onBack={back}
            actions={
              <IconButton aria-label="Закрыть корзину" className="text-muted-foreground" onClick={back}>
                <X size={22} />
              </IconButton>
            }
          />
        </div>
      }
      state={{
        query: { ...query, data: cart ?? (query.isError ? [] : undefined), isError: false },
        empty: !!cart && cart.lines.length === 0 && !query.isError,
        emptyTitle: "Корзина пуста",
        emptyDescription: "",
        onEmpty,
      }}
      after={after}
    >
      <CartNotice cart={cart} checking={checking} error={query.isError} confirmed={confirmed} retry={retry} />
      {cart && currency && cart.lines.length > 0 && (
        <>
          {before}
          <Card size="lg">
            <h2 className="text-title-2">Ваш заказ</h2>
            {available.length > 0 && (
              <>
                <ul className="space-y-4">{available.map((line) => row(line, currency))}</ul>
                <Divider />
              </>
            )}
            <CartGroupPromos
              cart={cart}
              currency={currency}
              blocked={promoBlocked}
              add={addPromoItems}
              open={(item, trigger) => {
                detailTrigger.current = trigger;
                setDetail({ sourceId: item.sourceId });
              }}
            />
            {cart.promo && (
              <CartPromotion
                cart={cart}
                currency={currency}
                disabled={checking || query.isError || !!pendingProducts?.size}
                mutation={promotion}
                publicOffers={publicOffers}
                deliveryMinor={total?.deliveryMinor ?? undefined}
              />
            )}
            <div className="flex items-baseline justify-between gap-2">
              <span>Товары</span>
              <strong>{formatMinor(cart.itemsMinor ?? cart.totalMinor, currency)}</strong>
            </div>
            {cart.adjustments.map((item) => (
              <div key={item.sourceId} className="flex justify-between gap-2">
                <span className="min-w-0 wrap-anywhere">
                  {item.groups?.type === "gift" ? "Количество в подарок" : item.label}
                </span>
                <strong className="text-status-success-foreground">−{formatMinor(-item.amount, currency)}</strong>
              </div>
            ))}
            {method && (
              <div className="flex justify-between gap-3">
                <span>{method === "pickup" ? "Самовывоз" : "Доставка"}</span>
                <span className="text-right">
                  {method === "pickup" ? "Бесплатно" : deliveryLabel(shipping, currency)}
                </span>
              </div>
            )}
            {total && (
              <>
                <Divider />
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-label">
                    {courier ? "К оплате магазину" : late ? "Итого за товары" : "Итого"}
                  </span>
                  <strong className="text-title-3">{formatMinor(total.totalMinor, currency)}</strong>
                </div>
              </>
            )}
          </Card>
          {unavailable.length > 0 && (
            <Card size="lg">
              <h2 className="text-title-3">Сейчас нет в наличии</h2>
              <ul className="space-y-4">{unavailable.map((line) => row(line, currency))}</ul>
            </Card>
          )}
        </>
      )}
      {detail && (
        <CartGroupDetails
          adjustment={promoBlocked ? undefined : detailAdjustment}
          part={detailAdjustment?.allocations?.find(({ variantId }) => variantId === detail.variantId)}
          {...{ cart, currency }}
          close={() => setDetail(undefined)}
          returnFocus={detailTrigger}
        />
      )}
      {available.length > 0 && cart && !cart.review && !checking && footer}
    </Screen>
  );
}
