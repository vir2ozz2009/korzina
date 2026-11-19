import { useNavigate } from "@tanstack/react-router";
import { useRef } from "react";
import { useToast } from "../../../app/shell/ToastProvider";
import { formatMinor } from "../../../shared/money";
import { Button } from "../../../ui/Button";
import { ProductRow } from "../../../ui/ProductRow";
import { Sheet } from "../../../ui/Sheet";
import { useRepeatOrder, useRepeatPreview } from "../api";

export function RepeatSheet({ number, currency, close }: { number: number; currency: string; close: () => void }) {
  const preview = useRepeatPreview(number, true);
  const repeat = useRepeatOrder(number);
  const navigate = useNavigate();
  const toast = useToast();
  const attempt = useRef({ check: "", key: "" });
  const data = preview.data;
  const canAdd = data?.lines.some(({ quantity }) => quantity > 0);
  const changed = data?.lines.some(
    (line) => line.previousMinor !== line.priceMinor || line.requested !== line.quantity,
  );
  function submit() {
    if (!data || repeat.isPending) return;
    const check = JSON.stringify([data.check, data.expectedCartRevision]);
    if (attempt.current.check !== check) attempt.current = { check, key: crypto.randomUUID() };
    repeat.mutate(
      { check: data.check, expectedCartRevision: data.expectedCartRevision, key: attempt.current.key },
      {
        onSuccess: ({ lines }) => {
          if (lines.some((line) => line.quantity < line.requested)) toast("Доступные товары добавлены в корзину");
          close();
          void navigate({ to: "/cart" });
        },
      },
    );
  }
  return (
    <Sheet
      open
      title="Повторить заказ"
      onOpenChange={(open) => {
        if (!open && !repeat.isPending) close();
      }}
    >
      <div className="space-y-3">
        {preview.isFetching && <p role="status">Проверяем цены и наличие…</p>}
        {(preview.isError || repeat.isError) && (
          <p role="alert">{repeat.error?.message ?? "Не удалось проверить заказ"}</p>
        )}
        {data && !canAdd && <p>Нет товаров, которые можно добавить</p>}
        {data?.lines.map((line) => (
          <ProductRow
            key={line.variantId}
            name={line.name}
            unit={line.unit}
            currency={currency}
            amountMinor={line.priceMinor ?? line.previousMinor}
            quantity={line.quantity || line.requested}
            variant="change"
            unavailable={!line.quantity}
            previous={
              line.priceMinor !== null && line.priceMinor !== line.previousMinor
                ? formatMinor(line.previousMinor, currency)
                : undefined
            }
            note={line.quantity ? `Доступно ${line.quantity}` : "Товар недоступен"}
          />
        ))}
        {(preview.isError || repeat.isError) && (
          <Button
            full
            variant="secondary"
            onClick={() => {
              if (repeat.isError && repeat.error?.message !== "Условия изменились. Проверьте товары ещё раз.") {
                submit();
                return;
              }
              repeat.reset();
              void preview.refetch();
            }}
          >
            Повторить
          </Button>
        )}
        {canAdd && !repeat.isError && (
          <Button full loading={repeat.isPending} disabled={preview.isFetching} onClick={submit}>
            {changed ? "Принять изменения и добавить" : "Добавить в корзину"}
          </Button>
        )}
        <Button full variant="secondary" disabled={repeat.isPending} onClick={close}>
          Назад
        </Button>
      </div>
    </Sheet>
  );
}
