import { useCallback, useEffect, useRef, useState } from "react";
import type { PromoTerms } from "../../../../shared/contracts/promo";
import { HttpError } from "../../../../shared/http-error";
import { formatMinor } from "../../../../shared/money";
import { Button } from "../../../../ui/Button";
import { Input } from "../../../../ui/Input";
import { Switch } from "../../../../ui/Switch";
import { CartSignIn, CartView } from "../../../cart";
import { CartContinueButton } from "../../../checkout";
import { CartShippingView } from "../../../receiving";
import { example, type PromoCatalog } from "./api";

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
  const [lines, setLines] = useState<Record<string, number>>({});
  const [confirmed, setConfirmed] = useState(true);
  const [completed, setCompleted] = useState(0);
  const [variant, setVariant] = useState("");
  const [receiving, setReceiving] = useState<"pickup" | "delivery">();
  const enteredCode = useRef<string | null>(null);
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
          confirmed,
          completed,
          enteredCode: code,
          publicOfferId,
          receiving,
          lines: Object.entries(lines).flatMap(([variantId, quantity]) => (quantity ? [{ variantId, quantity }] : [])),
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
        if (!controller.signal.aborted) setCart(result);
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
      <details className="mx-3 my-3 space-y-3 rounded-xl bg-card p-3" open>
        <summary className="min-h-8 cursor-pointer text-label">Тестовые данные · не видны покупателю</summary>
        <label className="block">
          Фасовка
          <select
            className="min-h-12 w-full rounded-lg border border-border bg-card px-3"
            value={variant}
            disabled={pending}
            onChange={(event) => setVariant(event.target.value)}
          >
            <option value="">Выберите товар</option>
            {catalog?.variants.map((item) => (
              <option value={item.id} key={item.id}>
                {item.productName} · {item.name}
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="secondary"
          disabled={
            !variant || pending || (!lines[variant] && Object.keys(lines).filter((id) => lines[id]).length >= 50)
          }
          onClick={() => setQuantity(variant, (lines[variant] ?? 0) + 1)}
        >
          Добавить товар
        </Button>
        {Object.entries(lines).map(([id, quantity]) => {
          const item = catalog?.variants.find((row) => row.id === id);
          return (
            <Input
              key={id}
              label={item ? `${item.productName} · ${item.name}` : id}
              type="number"
              min={0}
              max={999}
              value={quantity}
              disabled={pending}
              onChange={(event) => setQuantity(id, Number(event.target.value))}
            />
          );
        })}
        <Switch
          label="Подтверждённый покупатель"
          checked={confirmed}
          disabled={pending}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        <Input
          label="Выполнено заказов"
          type="number"
          min={0}
          max={1_000_000}
          value={completed}
          disabled={pending}
          onChange={(event) =>
            setCompleted(Math.max(0, Math.min(1_000_000, Math.trunc(Number(event.target.value)) || 0)))
          }
        />
      </details>
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
        shipping={null}
        method={cart?.method}
        total={cart && { totalMinor: cart.payableMinor, deliveryMinor: cart.deliveryMinor }}
        publicOffers={cart && { offers: cart.publicOffers, zone: cart.timeZone, failed: false, refresh: refetch }}
        before={
          cart && (
            <>
              <CartShippingView
                data={{
                  ...cart.fulfillment,
                  receiving: cart.method === "pickup" ? { mode: "pickup" } : null,
                  availability: null,
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
