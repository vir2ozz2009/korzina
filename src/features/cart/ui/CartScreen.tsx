import { useNavigate } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { Screen } from "../../../app/shell/Screen";
import { useToast } from "../../../app/shell/ToastProvider";
import { useBack } from "../../../app/shell/useBack";
import type { CartLine } from "../../../shared/contracts/cart";
import { formatMinor, multiplyMinor } from "../../../shared/money";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { Divider } from "../../../ui/Divider";
import { IconButton } from "../../../ui/IconButton";
import { ProductRow } from "../../../ui/ProductRow";
import { StickyFooter } from "../../../ui/StickyFooter";
import { useConfirmCart } from "../api";
import { useCart } from "../CartProvider";
import { cartSnapshot } from "../snapshot";
import { CartNotice } from "./CartNotice";

export function CartScreen() {
  const { query, change, pendingProducts } = useCart();
  const { refetch } = query;
  const [saved] = useState(cartSnapshot);
  const [opening, setOpening] = useState(true);
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
  const checking = opening || query.isFetching;
  const currency = cart?.currency;
  const available = cart?.lines.filter((line) => line.available) ?? [];
  const unavailable = cart?.lines.filter((line) => !line.available) ?? [];
  const issues = new Map(cart?.review?.changes.map((issue) => [issue.variantId, issue]));

  function row(line: CartLine, currency: string) {
    const issue = issues.get(line.variantId);
    const pending = pendingProducts.has(line.productId);
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
          previous={
            issue?.oldPriceMinor === undefined
              ? undefined
              : formatMinor(multiplyMinor(issue.oldPriceMinor, line.quantity), currency)
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
          onRemove={() => change(line, 0, currency)}
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
        <div className="bg-background px-3 pt-3">
          <Card size="lg">
            <div className="flex min-h-8 items-center justify-between">
              <h1 className="text-title-1">Корзина</h1>
              <IconButton aria-label="Закрыть корзину" className="-my-1.5 text-muted-foreground" onClick={back}>
                <X size={22} />
              </IconButton>
            </div>
          </Card>
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
          <Card size="lg">
            <h2 className="text-title-2">Ваш заказ</h2>
            {available.length > 0 && (
              <>
                <ul className="space-y-4">{available.map((line) => row(line, currency))}</ul>
                <Divider />
              </>
            )}
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-label">Итого за товары</span>
              <strong className="text-title-3">{formatMinor(cart.totalMinor, currency)}</strong>
            </div>
          </Card>
          {unavailable.length > 0 && (
            <Card size="lg">
              <h2 className="text-title-3">Сейчас нет в наличии</h2>
              <ul className="space-y-4">{unavailable.map((line) => row(line, currency))}</ul>
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}
