import { Ticket } from "lucide-react";
import { useRef, useState } from "react";
import type { Cart } from "../../../shared/contracts/cart";
import { HttpError } from "../../../shared/http-error";
import { Button } from "../../../ui/Button";
import { Divider } from "../../../ui/Divider";
import { Input } from "../../../ui/Input";
import { ListItem } from "../../../ui/ListItem";
import { Sheet } from "../../../ui/Sheet";
import type { PromoCartInput } from "../api";
import { ComparePromoCodes } from "./ComparePromoCodes";
import { PublicCartPromos, type PublicOffers, PublicPromoTriggers } from "./PublicCartPromos";
import { promoMessage } from "./promo-message";

export function CartPromotion({
  cart,
  currency,
  disabled,
  deliveryMinor = 0,
  mutation,
  publicOffers,
}: {
  cart: Cart;
  currency: string;
  disabled: boolean;
  deliveryMinor?: number;
  mutation: { isPending: boolean; mutateAsync: (value: { input: PromoCartInput; key: string }) => Promise<Cart> };
  publicOffers?: PublicOffers;
}) {
  const [mode, setMode] = useState<"actions" | "edit" | "compare" | "public">();
  const [selected, setSelected] = useState<string>();
  const [comparedOffer, setComparedOffer] = useState<string>();
  const [input, setInput] = useState("");
  const [candidate, setCandidate] = useState<NonNullable<Cart["promo"]>["alternative"]>();
  const [error, setError] = useState("");
  const [rejectedCode, setRejectedCode] = useState("");
  const key = useRef<{ value: string; key: string }>(undefined);
  const trigger = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLFormElement>(null);
  const { promo } = cart;
  const alternative = candidate ?? promo?.alternative;
  const canSubmit = !!input.trim() && input.trim().toUpperCase() !== rejectedCode && !mutation.isPending;
  const close = () => {
    setMode(undefined);
    setSelected(undefined);
    setComparedOffer(undefined);
    setCandidate(undefined);
    setError("");
    setRejectedCode("");
  };
  function openOffers(id?: string) {
    setSelected(id);
    setError("");
    setMode("public");
    publicOffers?.refresh();
  }
  const submit = async (
    action: "remove" | "keep" | "compare" | "apply",
    code = input,
    comparedTotal?: number,
    publicOfferId?: string,
    comparedDeliveryMinor?: number | null,
  ) => {
    if (mutation.isPending) return;
    setError("");
    const expectedRevision = cart.revision;
    const request =
      action === "remove" || action === "keep"
        ? ({ promoAction: action, expectedRevision } as const)
        : { promoAction: action, code, expectedRevision, comparedTotal, comparedDeliveryMinor, publicOfferId };
    const value = JSON.stringify(request);
    if (key.current?.value !== value) key.current = { value, key: crypto.randomUUID() };
    try {
      const result = await mutation.mutateAsync({ input: request, key: key.current.key });
      key.current = undefined;
      if (action === "compare") {
        const compared = result.promo?.alternative;
        if (!compared || compared.reason === "unknown") {
          setRejectedCode(code.trim().toUpperCase());
          setError(promoMessage({ reason: "unknown" }, currency) ?? "");
          field.current?.querySelector("input")?.focus();
          return;
        }
        setCandidate(compared);
        setComparedOffer(publicOfferId);
        setMode("compare");
      } else {
        setInput("");
        close();
      }
    } catch (failure) {
      if (publicOfferId) publicOffers?.refresh();
      const details = failure instanceof HttpError ? failure.details : null;
      const promo =
        details && typeof details === "object" && "promo" in details ? (details.promo as Cart["promo"]) : undefined;
      if (promo?.reason) {
        setRejectedCode(code.trim().toUpperCase());
        setCandidate(undefined);
        setMode("edit");
        setInput(code);
      }
      setError(
        promoMessage(promo, currency) ??
          (failure instanceof TypeError ? "Нет связи. Повторите." : (failure as Error).message),
      );
      field.current?.querySelector("input")?.focus();
    }
  };
  const publicTitle = selected ? "Условия акции" : "Доступные акции";
  const title = mode === "public" ? publicTitle : mode === "compare" ? "Сравнить промокоды" : "Промокод";
  return (
    <>
      <ListItem
        ref={trigger}
        variant="compact"
        title={promo?.code ?? "Промокод"}
        ariaLabel={promo?.code}
        subtitle={
          promo?.reason === "applied"
            ? promo.offerType === "discount"
              ? "Применён к товарам без скидки"
              : "Промокод применён"
            : undefined
        }
        icon={<Ticket size={20} />}
        disabled={disabled}
        onClick={() => {
          setError("");
          setCandidate(undefined);
          setMode(promo?.alternative ? "compare" : promo?.code ? "actions" : "edit");
        }}
      />
      {promo?.alternative && <p className="text-caption">Выберите код для объединённой корзины</p>}
      {promoMessage(promo, currency) && (
        <p className="text-caption text-muted-foreground">{promoMessage(promo, currency)}</p>
      )}
      {promo?.telegramHint && (
        <p className="text-caption text-muted-foreground">Войдите через Telegram для скидки на первый заказ</p>
      )}
      <PublicPromoTriggers
        {...{ publicOffers, currency }}
        hint={promo?.hint}
        currentCode={promo?.code}
        open={openOffers}
      />
      <Divider />
      <Sheet
        open={!!mode}
        unmountOnClose
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) close();
        }}
        returnFocus={trigger}
        title={title}
        onBack={mode === "public" && selected ? () => openOffers() : undefined}
        form
      >
        <div className="space-y-3">
          {mode === "public" && publicOffers && (
            <PublicCartPromos
              offers={publicOffers.offers}
              selected={selected}
              currency={currency}
              zone={publicOffers.zone}
              open={(id) => {
                setSelected(id);
                publicOffers.refresh();
              }}
              apply={(offer) => {
                if (offer.code)
                  void submit(
                    promo?.code && promo.code !== offer.code ? "compare" : "apply",
                    offer.code,
                    undefined,
                    offer.id,
                  );
              }}
              retry={publicOffers.failed ? publicOffers.refresh : undefined}
              manual={() => setMode("edit")}
              pending={mutation.isPending}
            />
          )}
          {mode === "actions" && (
            <>
              <Button full onClick={() => setMode("edit")}>
                Заменить
              </Button>
              <Button full variant="secondary" loading={mutation.isPending} onClick={() => void submit("remove")}>
                Убрать
              </Button>
            </>
          )}
          {mode === "edit" && (
            <form
              ref={field}
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (canSubmit) void submit(promo?.code ? "compare" : "apply");
              }}
            >
              <Input
                label="Промокод"
                autoComplete="off"
                placeholder="Введите код"
                maxLength={40}
                value={input}
                error={error}
                onChange={(event) => {
                  setInput(event.target.value);
                  setError("");
                }}
              />
              <Button full type="submit" disabled={!canSubmit} loading={mutation.isPending}>
                Применить
              </Button>
            </form>
          )}
          {mode === "compare" && alternative && (
            <ComparePromoCodes
              code={promo?.code}
              totalMinor={cart.totalMinor}
              {...{ alternative, deliveryMinor, currency }}
              note={promoMessage(alternative, currency)}
              pending={mutation.isPending}
              replace={() =>
                void submit("apply", alternative.code, alternative.totalMinor, comparedOffer, alternative.deliveryMinor)
              }
              keep={() => {
                if (promo?.alternative) void submit("keep");
                else close();
              }}
            />
          )}
          {error && mode !== "edit" && <p role="alert">{error}</p>}
        </div>
      </Sheet>
    </>
  );
}
