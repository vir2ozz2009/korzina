import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { QuoteResponse } from "../../../shared/contracts/checkout";
import { HttpError } from "../../../shared/http-error";
import { formatMinor } from "../../../shared/money";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { StickyFooter } from "../../../ui/StickyFooter";
import { usePrepareQuote, usePurchaseSummary } from "../../checkout";
import { type ReceivingState, useAvailability } from "../api";
import { deliveryLabel } from "../delivery-label";

export function ReceivingContinue({
  data,
  onTime,
  onDetails,
}: {
  data: ReceivingState;
  onTime: () => void;
  onDetails: (field: ReceivingState["requiredDetails"][number]) => void;
}) {
  const navigate = useNavigate();
  const schedule = useAvailability(data.receiving?.mode);
  const summary = usePurchaseSummary(data.revision);
  const prepare = usePrepareQuote();
  const [updated, setUpdated] = useState<QuoteResponse>();
  const total = summary.data;
  const timeRequired = schedule.data?.mode !== "after_order" && !data.time;
  const selection = data.receiving;
  const toCart = () => void navigate({ to: "/cart", search: (previous) => ({ shop: previous.shop }) });
  const toPayment = () => void navigate({ to: "/checkout/payment", search: (previous) => ({ shop: previous.shop }) });
  if (!selection || !total?.currency) return null;
  if (!total.acceptingOrders || total.unavailable?.[selection.mode])
    return (
      <Card role="status">
        <p>{total.closedMessage ?? total.unavailable?.[selection.mode] ?? "Магазин временно не принимает заказы"}</p>
        <Button full variant="secondary" onClick={toCart}>
          В корзину
        </Button>
      </Card>
    );
  if (total.shortMinor > 0 || !total.hasItems || !data.availability?.available) {
    return (
      <Card role="alert">
        <p>
          {total.shortMinor > 0
            ? `Добавьте товаров ещё на ${formatMinor(total.shortMinor, total.currency)}`
            : !total.hasItems
              ? "Корзина пуста"
              : "Проверьте способ получения"}
        </p>
        <Button full onClick={toCart}>
          В корзину
        </Button>
      </Card>
    );
  }

  async function next() {
    if (selection?.mode === "delivery") {
      const missing = data.requiredDetails.find((field) => !selection[field]?.trim());
      if (missing) return onDetails(missing);
    }
    if (timeRequired) return onTime();
    try {
      const quote = await prepare.mutateAsync();
      if (quote.totalMinor !== total?.totalMinor) setUpdated(quote);
      else toPayment();
    } catch (error) {
      if (error instanceof HttpError && error.code === "SLOT_TAKEN") {
        void schedule.refetch();
        onTime();
      }
    }
  }

  return (
    <>
      {prepare.error && <Card role="alert">{prepare.error.message}</Card>}
      {updated && updated.revision === data.revision && (
        <Card role="alert">
          <p>Условия заказа изменились</p>
          <p>Было {formatMinor(total.totalMinor, total.currency)}</p>
          <p>Стало {formatMinor(updated.totalMinor, updated.currency)}</p>
          <Button full onClick={toPayment}>
            Подтвердить и к оплате
          </Button>
        </Card>
      )}
      <StickyFooter floating>
        <Button
          full
          size="xl"
          className="shadow-float"
          loading={prepare.isPending}
          disabled={schedule.isPending || summary.isFetching || !!updated}
          subtitle={
            schedule.data?.mode === "after_order"
              ? "Дату и время согласуем после заказа"
              : deliveryLabel(data.availability, total.currency)
          }
          onClick={() => void next()}
        >
          {timeRequired ? "Выбрать время" : `К оплате · ${formatMinor(total.totalMinor, total.currency)}`}
        </Button>
      </StickyFooter>
    </>
  );
}
