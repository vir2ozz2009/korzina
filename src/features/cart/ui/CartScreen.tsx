import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useToast } from "../../../app/shell/ToastProvider";
import { useBack } from "../../../app/shell/useBack";
import { telegramLaunch } from "../../../app/telegram/launch";
import { shopTimeZone } from "../../../shared/shop-api";
import { Button } from "../../../ui/Button";
import { StickyFooter } from "../../../ui/StickyFooter";
import { CartContinue, usePurchaseSummary } from "../../checkout";
import { ContactSheet, useContact } from "../../contact";
import { activeReceiving, CartShipping, useReceiving } from "../../receiving";
import { useAddPromoItems, useConfirmCart, usePromoCart, usePublicCartPromos } from "../api";
import { useCart } from "../CartProvider";
import { cartSnapshot } from "../snapshot";
import { CartSignIn } from "./CartSignIn";
import { CartView } from "./CartView";
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
  const toast = useToast();
  const confirm = useConfirmCart(toast);
  const addPromoItems = useAddPromoItems(toast);
  const cart = query.data ?? saved;
  usePromoRefresh(cart?.promo, refetch);
  const checking = opening || query.isFetching || addPromoItems.isPending;
  const currency = cart?.currency;
  const available = cart?.lines.filter((line) => line.available) ?? [];
  const summary = usePurchaseSummary(available.length > 0 ? cart?.revision : undefined);
  const total = !checking && !summary.isFetching && !summary.isError ? summary.data : undefined;
  const receiving = useReceiving(!!cart?.lines.length);
  const shipping = total?.availability ?? receiving.data?.availability ?? null;
  const method = receiving.data ? activeReceiving(receiving.data) : undefined;
  const promotion = usePromoCart();
  const publicQuery = usePublicCartPromos(
    !opening && !cart?.review && query.data?.promo && available.length ? query.data.revision : undefined,
    !!contact.data?.telegramLinked,
  );
  return (
    <CartView
      {...{ cart, query, change, pendingProducts, checking, back, shipping, method, promotion }}
      total={
        total && {
          deliveryMinor: total.deliveryMinor,
          totalMinor: cart?.promo ? cart.totalMinor + total.deliveryMinor : total.totalMinor,
        }
      }
      retry={() => void refetch()}
      addPromoItems={(items) => {
        if (cart && !addPromoItems.isPending)
          addPromoItems.mutate({
            input: {
              addItems: items.map(({ variantId, quantity }) => ({ variantId, quantity })),
              expectedRevision: cart.revision,
            },
            key: crypto.randomUUID(),
          });
      }}
      confirmed={confirm.isSuccess}
      publicOffers={{
        offers: publicQuery.isError ? [] : (publicQuery.data ?? []),
        zone: shopTimeZone,
        failed: publicQuery.isError,
        refresh: () => void publicQuery.refetch(),
      }}
      openLine={(line) =>
        void navigate({ to: "/p/$id", params: { id: line.productId }, search: { variant: line.variantId } })
      }
      onEmpty={() => void navigate({ to: "/" })}
      before={
        cart &&
        currency && (
          <>
            <CartShipping
              currency={currency}
              revision={cart.revision}
              disabled={checking || query.isError || !!cart.review || pendingProducts.size > 0}
              open={addressOpen}
              setOpen={setAddressOpen}
            />
            {!telegramLaunch && contact.data && !contact.data.phone && !contact.data.telegramLinked && (
              <CartSignIn onTelegram={() => setContactMode("telegram")} onPhone={() => setContactMode("phone")} />
            )}
          </>
        )
      }
      after={
        <>
          {cart?.review && !checking && !query.isError && (
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
          )}
          <ContactSheet mode={contactMode} close={() => setContactMode(undefined)} />
        </>
      }
      footer={
        cart && (
          <CartContinue
            revision={cart.revision}
            summary={summary}
            disabled={checking || query.isError || pendingProducts.size > 0}
            address={() => setAddressOpen(true)}
            contact={() => setContactMode(telegramLaunch ? "phone" : "telegram")}
          />
        )
      }
    />
  );
}
