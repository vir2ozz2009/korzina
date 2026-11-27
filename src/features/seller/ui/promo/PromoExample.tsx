import { useCallback, useEffect, useRef, useState } from "react";
import type { PromoTerms } from "../../../../shared/contracts/promo";
import { HttpError } from "../../../../shared/http-error";
import { formatMinor } from "../../../../shared/money";
import { Button } from "../../../../ui/Button";
import { CartSignIn, CartView } from "../../../cart";
import { CartContinueButton } from "../../../checkout";
import { CartShippingView } from "../../../receiving";
import { example, type PromoCatalog } from "./api";
import { PromoExampleControls } from "./PromoExampleControls";

export function PromoExample({
  terms,
  catalog,
  store,
  back,
  revoke,
}: {
  terms: PromoTerms;
  catalog?: PromoCatalog;
  store: string;
  back: () => void;
  revoke: () => void;
}) {
  const [lines, setLines] = useState<Record<string, number>>();
  const [confirmed, setConfirmed] = useState(true);
  const [completed, setCompleted] = useState(0);
  const [receiving, setReceiving] = useState<"pickup" | "delivery">();
  const enteredCode = useRef<string | null>(terms.kind === "code" ? (terms.code ?? null) : null);
  const [cart, setCart] = useState<Awaited<ReturnType<typeof example>>>();
  const [checking, setChecking] = useState(true);
  const [pending, setPending] = useState(false);
  const applying = useRef(false);
  const [error, setError] = useState(false);
  const [retryNumber, retry] = useState(0);
  const request = useCallback(
    (code: string | null, signal?: AbortSignal, publicOfferId?: string) =>
      example(
        store,
        {
          terms,
          automatic: lines === undefined,
          confirmed,
          completed,
          enteredCode: code,
          publicOfferId,
          receiving,
          lines: Object.entries(lines ?? {}).flatMap(([variantId, quantity]) =>
            quantity ? [{ variantId, quantity }] : [],
          ),
        },
        signal,
      ),
    [store, terms, confirmed, completed, receiving, lines],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: a retry repeats the same quote without changing any input.
  useEffect(() => {
    const controller = new AbortController();
    setChecking(true);
    setError(false);
    void request(enteredCode.current, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setCart(result);
          if (lines === undefined && result.lines.length && !result.exampleProblem) {
            setLines(Object.fromEntries(result.lines.map((line) => [line.variantId, line.quantity])));
            setConfirmed(result.confirmed);
            setCompleted(result.completed);
          }
        }
      })
      .catch((failure) => {
        if (controller.signal.aborted) return;
        if (failure instanceof HttpError && [401, 403].includes(failure.status)) revoke();
        else setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setChecking(false);
      });
    return () => controller.abort();
  }, [request, retryNumber, revoke]);

  const setQuantity = (id: string, quantity: number) =>
    setLines((previous) => ({
      ...previous,
      [id]: Math.min(999, Math.max(0, Math.trunc(quantity) || 0)),
    }));
  const blocked = checking || pending;
  const refetch = () => retry((value) => value + 1);
  const currency = cart?.currency;
  return (
    <>
      <PromoExampleControls
        {...{ terms, catalog, lines, pending, confirmed, setConfirmed, completed, setCompleted, setQuantity }}
      />
      {cart?.exampleProblem && (
        <div className="m-3 rounded-xl bg-card p-4" role="status">
          <p>{cart.exampleProblem}</p>
          <Button variant="secondary" onClick={back}>
            Вернуться к условиям
          </Button>
          <a
            href={`/seller/${cart.exampleProblem.includes("Доставка") ? "receiving" : "products"}?store=${encodeURIComponent(store)}`}
          >
            Открыть {cart.exampleProblem.includes("Доставка") ? "настройки" : "товары"}
          </a>
        </div>
      )}
      <CartView
        cart={cart}
        checking={checking}
        query={{ data: cart, isPending: checking, isError: error, refetch }}
        retry={refetch}
        addPromoItems={(items) =>
          setLines((previous) => {
            const next = { ...previous };
            for (const { variantId, quantity } of items)
              next[variantId] = Math.min(999, (next[variantId] ?? 0) + quantity);
            return next;
          })
        }
        change={(line, quantity) => setQuantity(line.variantId, quantity)}
        back={back}
        shipping={cart?.availability ?? null}
        method={cart?.method}
        total={cart && { totalMinor: cart.payableMinor, deliveryMinor: cart.deliveryMinor }}
        publicOffers={cart && { offers: cart.publicOffers, zone: cart.timeZone, failed: false, refresh: refetch }}
        before={
          cart && (
            <>
              <CartShippingView
                data={{
                  ...cart.fulfillment,
                  receiving: cart.receiving,
                  availability: cart.availability,
                }}
                blocked={blocked}
                choose={setReceiving}
              />
              {!confirmed && <CartSignIn />}
            </>
          )
        }
        footer={
          cart?.fulfillment.acceptingOrders &&
          currency && (
            <CartContinueButton
              disabled
              amount={formatMinor(cart.payableMinor, currency)}
              needsAddress={cart.method === "delivery"}
              needsContact={!confirmed}
            />
          )
        }
        promotion={{
          isPending: blocked,
          mutateAsync: async ({ input }) => {
            if (applying.current || checking) throw new Error("Проверяем корзину…");
            applying.current = true;
            setPending(true);
            try {
              const code = "code" in input ? input.code : input.promoAction === "remove" ? null : enteredCode.current;
              const result = await request(code, undefined, "publicOfferId" in input ? input.publicOfferId : undefined);
              const reason = result.promo?.reason;
              if (code && (reason === "unknown" || reason === "expired" || reason === "scheduled"))
                throw new HttpError(400, "Промокод не применён", "VALIDATION", { promo: result.promo });
              if (input.promoAction === "compare" && code) {
                return {
                  ...result,
                  promo: {
                    ...result.promo,
                    alternative: {
                      code,
                      totalMinor: result.totalMinor,
                      deliveryMinor: result.delivery?.feeMinor,
                      reason,
                      missingMinor: result.promo?.missingMinor,
                      missingQuantity: result.promo?.missingQuantity,
                    },
                  },
                };
              }
              setCart(result);
              enteredCode.current = code;
              return result;
            } catch (failure) {
              if (failure instanceof HttpError && [401, 403].includes(failure.status)) revoke();
              throw failure;
            } finally {
              applying.current = false;
              setPending(false);
            }
          },
        }}
      />
    </>
  );
}
