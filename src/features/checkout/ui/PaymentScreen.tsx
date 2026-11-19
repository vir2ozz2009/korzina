import { useQueryClient } from "@tanstack/react-query";
import { Navigate, useNavigate } from "@tanstack/react-router";
import { MapPin, Phone, Store } from "lucide-react";
import { useState } from "react";
import { Header } from "../../../app/shell/Header";
import { Screen } from "../../../app/shell/Screen";
import type { CheckoutCommand, QuoteResponse } from "../../../shared/contracts/checkout";
import { HttpError } from "../../../shared/http-error";
import { formatMinor } from "../../../shared/money";
import { shopKey } from "../../../shared/shop-api";
import { rememberBuyer } from "../../../shared/shop-session";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { ListItem } from "../../../ui/ListItem";
import { Radio } from "../../../ui/Radio";
import { StickyFooter } from "../../../ui/StickyFooter";
import { ContactSheet, useContact } from "../../contact";
import { orderKeys } from "../../orders";
import { ReceivingTime, useReceiving } from "../../receiving";
import { type Attempt, usePlaceOrder, useQuote } from "../api";
import { readAttempt, storeAttempt, storeOrderNumber } from "../session";
import { PaymentHelp, QuoteChange, TransferInstruction } from "./PaymentExtras";
import { PurchaseTotals } from "./PurchaseTotals";
import { ReceiptField } from "./ReceiptField";
import { useReceipt } from "./useReceipt";

export function PaymentScreen() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const receiving = useReceiving();
  const contact = useContact();
  const receipt = useReceipt();
  const [method, setMethod] = useState<CheckoutCommand["payment"] | undefined>(() =>
    receipt.draft?.bound ? "transfer" : undefined,
  );
  const [timeOpen, setTimeOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [attempt, setAttempt] = useState(readAttempt);
  const [before, setBefore] = useState<QuoteResponse>();
  const [failure, setFailure] = useState("");
  const place = usePlaceOrder();
  const readyContact = !!(contact.data?.phone || contact.data?.telegramLinked);
  const readyReceiving = !!receiving.data?.receiving;
  const query = useQuote(receiving.data?.revision, contact.data, !attempt && readyContact && readyReceiving);
  const quote = query.data;
  const selected = method ?? quote?.paymentSettings.methods[0];
  const available = selected && quote?.paymentSettings.methods.includes(selected);
  const busy = !!attempt || place.isPending || receipt.pending;
  const needsAccept = !!(before && quote && before.quoteRevision !== quote.quoteRevision);
  const disabled =
    busy ||
    !available ||
    needsAccept ||
    query.isFetching ||
    query.isError ||
    (selected === "transfer" && !receipt.draft?.bound);

  async function send(next: Attempt) {
    if (place.isPending) return;
    setFailure("");
    setAttempt(next);
    storeAttempt(next);
    try {
      const order = await place.mutateAsync(next);
      rememberBuyer(true);
      void client.invalidateQueries({ queryKey: orderKeys });
      client.setQueryData(["shop", shopKey, "order", order.number], order);
      storeOrderNumber(order.number);
      receipt.complete();
      storeAttempt();
      void client.invalidateQueries({ queryKey: ["shop", shopKey, "cart"] });
      void client.invalidateQueries({ queryKey: ["shop", shopKey, "receiving"] });
      void client.invalidateQueries({ queryKey: ["shop", shopKey, "purchase-summary"] });
      await navigate({
        to: "/checkout/done",
        search: (previous) => ({ shop: previous.shop, order: order.number }),
        replace: true,
      });
    } catch (error) {
      if (error instanceof HttpError && error.status < 500 && error.status !== 429) {
        storeAttempt();
        setAttempt(undefined);
        setFailure(error.message);
        if (error.code === "QUOTE_CHANGED" || error.code === "PAYMENT_METHOD_UNAVAILABLE") {
          if (quote) setBefore(quote);
          void query.refetch();
        } else if (error.code === "SLOT_TAKEN") {
          void client.invalidateQueries({ queryKey: ["shop", shopKey, "receiving", "availability"] });
          setTimeOpen(true);
        }
      } else {
        setFailure("Ответ об оформлении не получен");
      }
    }
  }

  function submit() {
    if (disabled || !quote || !selected) return;
    const proof = receipt.draft?.proofId;
    const request: CheckoutCommand | undefined =
      selected === "cash"
        ? { quoteRevision: quote.quoteRevision, payment: "cash" }
        : proof
          ? { quoteRevision: quote.quoteRevision, payment: "transfer", proofMediaId: proof }
          : undefined;
    if (request) void send({ key: crypto.randomUUID(), request, startedAt: Date.now() });
  }

  const draft = receiving.data;
  if (!attempt && ((contact.data && !readyContact) || (draft && !readyReceiving)))
    return <Navigate to="/cart" search={(previous) => ({ shop: previous.shop })} replace />;
  const address =
    quote?.receiving.mode === "delivery"
      ? quote.receiving.address
      : quote?.fulfillment.mode === "pickup"
        ? quote.fulfillment.pickup.address
        : undefined;
  const error = query.error instanceof HttpError ? query.error : undefined;
  const cartError =
    error &&
    ["OUT_OF_ZONE", "PICKUP_UNAVAILABLE", "QUOTE_CHANGED", "MIN_ORDER_SUM", "UNAUTHORIZED"].includes(error.code ?? "");
  const receivingError = error?.code === "SLOT_TAKEN" || error?.code === "VALIDATION";

  return (
    <Screen
      template="checkout"
      header={<Header title="Оплата" />}
      after={
        quote &&
        !attempt &&
        !query.isError && (
          <StickyFooter floating>
            <Button full size="xl" className="shadow-float" disabled={disabled} onClick={submit}>
              Оформить заказ · {formatMinor(quote.totalMinor, quote.currency)}
            </Button>
          </StickyFooter>
        )
      }
    >
      {attempt ? (
        <Card role="status">
          <p>{place.isPending ? "Проверяем результат…" : failure || "Ответ об оформлении не получен"}</p>
          <Button full loading={place.isPending} onClick={() => void send(attempt)}>
            Проверить ещё раз
          </Button>
        </Card>
      ) : (
        <>
          {query.isPending && !query.isError && <Card role="status">Проверяем оплату…</Card>}
          {(receiving.isError || contact.isError || query.isError) && (
            <Card role="alert">
              <p>{error?.message ?? "Не удалось проверить оплату"}</p>
              <Button
                full
                variant="secondary"
                onClick={() => {
                  if (cartError)
                    void navigate({ to: "/cart", search: (previous) => ({ shop: previous.shop }), replace: true });
                  else if (receivingError)
                    void navigate({
                      to: "/checkout/receiving",
                      search: (previous) => ({ shop: previous.shop }),
                      replace: true,
                    });
                  else if (receiving.isError) void receiving.refetch();
                  else if (contact.isError) void contact.refetch();
                  else void query.refetch();
                }}
              >
                {cartError ? "К корзине" : receivingError ? "К получению" : "Повторить"}
              </Button>
            </Card>
          )}
          {failure && !needsAccept && !query.isError && <Card role="alert">{failure}</Card>}
          {quote && draft && !query.isError && (
            <>
              <ReceivingTime data={draft} open={timeOpen} setOpen={setTimeOpen} disabled={busy} />
              {address && (
                <ListItem
                  title={quote.receiving.mode === "delivery" ? "Адрес доставки" : "Самовывоз"}
                  subtitle={address}
                  icon={quote.receiving.mode === "delivery" ? <MapPin size={22} /> : <Store size={22} />}
                />
              )}
              <ListItem
                title={quote.telegramLinked ? "Telegram подключён" : "Номер для заказа"}
                subtitle={quote.phone ?? undefined}
                icon={<Phone size={20} />}
                value="Изменить"
                onClick={busy ? undefined : () => setContactOpen(true)}
              />
              <PurchaseTotals {...quote} />
              {before && needsAccept && (
                <QuoteChange
                  old={before}
                  quote={quote}
                  hasReceipt={!!receipt.draft?.bound}
                  accept={() => {
                    setBefore(undefined);
                    setFailure("");
                  }}
                />
              )}
              <Card>
                <h2 className="text-title-3">Способ оплаты</h2>
                <fieldset aria-label="Способ оплаты" disabled={busy}>
                  {quote.paymentSettings.methods.map((item) => (
                    <Radio
                      key={item}
                      name="payment"
                      checked={item === selected}
                      label={item === "cash" ? "Наличные" : "Перевод"}
                      onChange={() => setMethod(item)}
                    />
                  ))}
                </fieldset>
                {selected === "transfer" && available && (
                  <>
                    <TransferInstruction key={quote.paymentSettings.qrSrc} {...quote.paymentSettings} />
                    <ReceiptField
                      quoteRevision={quote.quoteRevision}
                      receipt={receipt}
                      locked={place.isPending || needsAccept || query.isFetching}
                    />
                  </>
                )}
              </Card>
              <ContactSheet mode={contactOpen ? "phone" : undefined} close={() => setContactOpen(false)} />
            </>
          )}
        </>
      )}
      <PaymentHelp />
    </Screen>
  );
}
