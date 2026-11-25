import { Tag } from "lucide-react";
import { useRef, useState } from "react";
import type { Cart } from "../../../shared/contracts/cart";
import type { PromoReason } from "../../../shared/contracts/promo";
import { HttpError } from "../../../shared/http-error";
import { formatMinor } from "../../../shared/money";
import { Button } from "../../../ui/Button";
import { Input } from "../../../ui/Input";
import { Sheet } from "../../../ui/Sheet";
import { usePromoCart } from "../api";

const descriptions: Partial<Record<PromoReason, string>> = {
  better_automatic: "Скидка магазина выгоднее",
  unknown: "Код не найден",
  expired: "Срок действия закончился",
  disabled: "Код больше не действует",
  scheduled: "Срок действия ещё не начался",
  limit: "Лимит исчерпан",
  personal_limit: "Вы уже использовали этот промокод",
  telegram: "Подключите Telegram, чтобы проверить условия",
  purchase_early: "Скидка станет доступна после выполненных покупок",
  purchase_passed: "Скидка действует на другой номер заказа",
  purchase_used: "Скидка на эту покупку уже использована",
  scope: "Добавьте подходящие товары",
  regular_price: "Промокод действует на товары без скидки",
};
function message(
  promo: Pick<NonNullable<Cart["promo"]>, "reason" | "missingMinor" | "missingQuantity"> | undefined,
  currency: string,
) {
  if (promo?.reason === "minimum" && promo.missingMinor)
    return `Добавьте подходящих товаров ещё на ${formatMinor(promo.missingMinor, currency)}`;
  if (promo?.reason === "quantity") return `Добавьте подходящие товары · ещё ${promo.missingQuantity} шт.`;
  return promo?.reason && descriptions[promo.reason];
}
export function CartPromotion({ cart, currency, disabled }: { cart: Cart; currency: string; disabled: boolean }) {
  const [mode, setMode] = useState<"actions" | "edit" | "compare">();
  const [input, setInput] = useState("");
  const [candidate, setCandidate] = useState<NonNullable<Cart["promo"]>["alternative"]>();
  const [error, setError] = useState("");
  const key = useRef<{ value: string; key: string }>(undefined);
  const trigger = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLFormElement>(null);
  const mutation = usePromoCart();
  const { promo } = cart;
  const alternative = candidate ?? promo?.alternative;
  const close = () => {
    setMode(undefined);
    setCandidate(undefined);
    setError("");
  };
  const submit = async (action: "remove" | "compare" | "apply", code = input, comparedTotal?: number) => {
    if (mutation.isPending) return;
    setError("");
    const expectedRevision = cart.revision;
    const request =
      action === "remove"
        ? ({ promoAction: action, expectedRevision } as const)
        : { promoAction: action, code, expectedRevision, comparedTotal };
    const value = JSON.stringify(request);
    if (key.current?.value !== value) key.current = { value, key: crypto.randomUUID() };
    try {
      const result = await mutation.mutateAsync({ input: request, key: key.current.key });
      key.current = undefined;
      if (action === "compare") {
        setCandidate(result.promo?.alternative);
        setMode("compare");
      } else close();
    } catch (failure) {
      const details = failure instanceof HttpError ? failure.details : null;
      const promo =
        details && typeof details === "object" && "promo" in details ? (details.promo as Cart["promo"]) : undefined;
      setError(
        message(promo, currency) ??
          (failure instanceof TypeError ? "Нет связи. Повторите." : (failure as Error).message),
      );
      field.current?.querySelector("input")?.focus();
    }
  };
  return (
    <>
      <div ref={trigger} tabIndex={-1}>
        <Button
          full
          variant="secondary"
          icon={<Tag size={18} />}
          disabled={disabled}
          onClick={() => {
            setInput("");
            setError("");
            setCandidate(undefined);
            setMode(promo?.alternative ? "compare" : promo?.code ? "actions" : "edit");
          }}
        >
          {promo?.code ?? "Промокод"}
        </Button>
      </div>
      {promo?.alternative && <p className="text-caption">Выберите код для объединённой корзины</p>}
      {message(promo, currency) && <p className="text-caption text-muted-foreground">{message(promo, currency)}</p>}
      {promo?.telegramHint && (
        <p className="text-caption text-muted-foreground">Войдите через Telegram для скидки на первый заказ</p>
      )}
      {promo?.hint && (
        <p className="text-caption text-muted-foreground">
          Ещё {formatMinor(promo.hint.missingMinor, currency)} до скидки · {promo.hint.label}
        </p>
      )}
      <Sheet
        open={!!mode}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) close();
        }}
        returnFocus={trigger}
        title={mode === "compare" ? "Сравнить промокоды" : "Промокод"}
        form
      >
        <div className="space-y-3">
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
                void submit(promo?.code ? "compare" : "apply");
              }}
            >
              <Input
                label="Промокод"
                autoComplete="off"
                maxLength={40}
                value={input}
                error={error}
                onChange={(event) => {
                  setInput(event.target.value);
                  setError("");
                }}
              />
              <Button full type="submit" disabled={!input.trim()} loading={mutation.isPending}>
                Применить
              </Button>
            </form>
          )}
          {mode === "compare" && alternative && (
            <>
              <p>
                {promo?.code} · {formatMinor(cart.totalMinor, currency)}
              </p>
              <p>
                {alternative.code} · {formatMinor(alternative.totalMinor, currency)}
              </p>
              {message(alternative, currency) && <p>{message(alternative, currency)}</p>}
              <Button
                full
                loading={mutation.isPending}
                onClick={() => void submit("apply", alternative.code, alternative.totalMinor)}
              >
                Заменить код
              </Button>
              <Button full variant="secondary" disabled={mutation.isPending} onClick={close}>
                Оставить прежний
              </Button>
            </>
          )}
          {error && mode !== "edit" && <p role="alert">{error}</p>}
        </div>
      </Sheet>
    </>
  );
}
