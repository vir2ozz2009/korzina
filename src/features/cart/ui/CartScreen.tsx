import { useNavigate } from "@tanstack/react-router";
import { Send, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Screen } from "../../../app/shell/Screen";
import { useToast } from "../../../app/shell/ToastProvider";
import { useBack } from "../../../app/shell/useBack";
import { telegramLaunch } from "../../../app/telegram/launch";
import type { CartLine } from "../../../shared/contracts/cart";
import { formatMinor, multiplyMinor } from "../../../shared/money";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { Divider } from "../../../ui/Divider";
import { Header } from "../../../ui/Header";
import { IconButton } from "../../../ui/IconButton";
import { ProductRow } from "../../../ui/ProductRow";
import { StickyFooter } from "../../../ui/StickyFooter";
import { CartContinue, usePurchaseSummary } from "../../checkout";
import { ContactSheet, useContact } from "../../contact";
import { activeReceiving, CartShipping, deliveryLabel, useReceiving } from "../../receiving";
import { useConfirmCart } from "../api";
import { useCart } from "../CartProvider";
import { cartSnapshot } from "../snapshot";
import { CartNotice } from "./CartNotice";
import { CartPromotion } from "./CartPromotion";
import { usePromoRefresh } from "./usePromoRefresh";

export function CartScreen() {
  const { query, change, pendingProducts } = useCart();
  const { refetch } = query;
  const [saved] = useState(cartSnapshot);
  const [opening, setOpening] = useState(true);
  const [addressOpen, setAddressOpen] = useState(false);
  const [contactMode, setContactMode] = useState<"telegram" | "phone">();
  const contact = useContact(!!query.data?.lines.length);
  useEffect(() => {
    let open = true;
    void refetch({ cancelRefetch: false }).finally(() => {
      if (open) setOpening(false);
    });
    return () => {
      open = false;
    };
  }, [refetch]);

  const navigate = useNavigate();
  const back = useBack();
  const confirm = useConfirmCart(useToast());
  const cart = query.data ?? saved;
  usePromoRefresh(cart?.promo, refetch);
  const checking = opening || query.isFetching;
  const currency = cart?.currency;
  const available = cart?.lines.filter((line) => line.available) ?? [];
  const summary = usePurchaseSummary(available.length > 0 ? cart?.revision : undefined);
  const total = !checking && !summary.isFetching && !summary.isError ? summary.data : undefined;
  const receiving = useReceiving(!!cart?.lines.length);
  const shipping = total?.availability ?? receiving.data?.availability ?? null;
  const method = receiving.data ? activeReceiving(receiving.data) : undefined;
  const courier =
    shipping?.mode === "delivery" && shipping.available && shipping.payee === "courier" && shipping.tariff !== "free";
  const late = shipping?.mode === "delivery" && shipping.available && shipping.feeMinor === null;
  const unavailable = cart?.lines.filter((line) => !line.available) ?? [];
  const issues = new Map(cart?.review?.changes.map((issue) => [issue.variantId, issue]));

  function row(line: CartLine, currency: string) {
    const issue = issues.get(line.variantId);
    const pending = pendingProducts.has(line.productId);
    const previous = issue?.oldPriceMinor ?? line.oldPriceMinor;
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
          amountMinor={
            line.available
              ? (line.totalMinor ?? multiplyMinor(line.priceMinor, line.quantity))
              : multiplyMinor(line.priceMinor, line.quantity)
          }
          previous={previous == null ? undefined : formatMinor(multiplyMinor(previous, line.quantity), currency)}
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
          onOpen={() =>
            void navigate({ to: "/p/$id", params: { id: line.productId }, search: { variant: line.variantId } })
          }
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
        onEmpty: () => void navigate({ to: "/" }),
      }}
      after={
        cart?.review &&
        !checking &&
        !query.isError && (
          <StickyFooter floating>
            <Button
              full
              size="xl"
              className="shadow-float"
              loading={confirm.isPending}
              disabled={pendingProducts.size > 0}
              onClick={() => confirm.mutate({ revision: cart.revision, key: crypto.randomUUID() })}
            >
              Принять изменения
            </Button>
          </StickyFooter>
        )
      }
    >
      <CartNotice
        cart={cart}
        checking={checking}
        error={query.isError}
        confirmed={confirm.isSuccess}
        retry={() => void refetch()}
      />
      {cart && currency && cart.lines.length > 0 && (
        <>
          <CartShipping
            currency={currency}
            revision={cart.revision}
            disabled={checking || query.isError || !!cart.review || pendingProducts.size > 0}
            open={addressOpen}
            setOpen={setAddressOpen}
          />
          {!telegramLaunch && contact.data && !contact.data.phone && !contact.data.telegramLinked && (
            <Card className="text-center">
              <Button full icon={<Send size={16} />} onClick={() => setContactMode("telegram")}>
                Войти через Telegram
              </Button>
              <button
                type="button"
                className="min-h-8 text-caption text-muted-foreground underline"
                onClick={() => setContactMode("phone")}
              >
                У меня нет Telegram
              </button>
            </Card>
          )}
          <Card size="lg">
            <h2 className="text-title-2">Ваш заказ</h2>
            {available.length > 0 && (
              <>
                <ul className="space-y-4">{available.map((line) => row(line, currency))}</ul>
                <Divider />
              </>
            )}
            {cart.promo && (
              <CartPromotion cart={cart} currency={currency} disabled={checking || !!pendingProducts.size} />
            )}
            <div className="flex items-baseline justify-between gap-2">
              <span>Товары</span>
              <strong>{formatMinor(cart.itemsMinor ?? cart.totalMinor, currency)}</strong>
            </div>
            {cart.adjustments.map((item) => (
              <div key={item.sourceId} className="flex justify-between gap-2">
                <span>{item.label}</span>
                <strong>−{formatMinor(-item.amount, currency)}</strong>
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
                  <strong className="text-title-3">
                    {formatMinor(cart.promo ? cart.totalMinor + total.deliveryMinor : total.totalMinor, currency)}
                  </strong>
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
      {available.length > 0 && cart && !cart.review && !checking && (
        <CartContinue
          revision={cart.revision}
          summary={summary}
          disabled={checking || query.isError || pendingProducts.size > 0}
          address={() => setAddressOpen(true)}
          contact={() => setContactMode(telegramLaunch ? "phone" : "telegram")}
        />
      )}
      <ContactSheet mode={contactMode} close={() => setContactMode(undefined)} />
    </Screen>
  );
}
