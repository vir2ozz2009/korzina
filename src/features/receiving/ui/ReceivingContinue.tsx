import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { QuoteResponse } from "../../../shared/contracts/checkout";
import { HttpError } from "../../../shared/http-error";
import { formatMinor } from "../../../shared/money";
import { isTimeAvailable, requiresReceivingTime } from "../../../shared/receiving-hours";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { StickyFooter } from "../../../ui/StickyFooter";
import { usePrepareQuote, usePurchaseSummary } from "../../checkout";
import type { ReceivingState } from "../api";
import { deliveryLabel } from "../delivery-label";
import type { useReceivingTime } from "../useReceivingTime";

export function ReceivingContinue({
  data,
  timeSelection,
  onTime,
  onDetails,
}: {
  data: ReceivingState;
  timeSelection: ReturnType<typeof useReceivingTime>;
  onTime: () => void;
  onDetails: (field: ReceivingState["requiredDetails"][number]) => void;
}) {
  const navigate = useNavigate();
  const { schedule, needsTime, schedulingLater, checking, error: timeError } = timeSelection;
  const summary = usePurchaseSummary(data.revision);
  const prepare = usePrepareQuote();
  const [updated, setUpdated] = useState<QuoteResponse>();
  const currentUpdate = updated?.revision === data.revision ? updated : undefined;
  const total = summary.data;
  const selection = data.receiving;
  const toCart = () => void navigate({ to: "/cart", search: (previous) => ({ shop: previous.shop }) });
  const toPayment = () => void navigate({ to: "/checkout/payment", search: (previous) => ({ shop: previous.shop }) });
  if (summary.isFetching) return null;
  if (summary.isError)
    return (
      <Card role="alert">
        Не удалось пересчитать заказ{" "}
        <Button variant="secondary" onClick={() => void summary.refetch()}>
          Повторить
        </Button>
      </Card>
    );
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
    if (needsTime) return onTime();
    try {
      const quote = await prepare.mutateAsync();
      if (quote.totalMinor !== total?.totalMinor) setUpdated(quote);
      else toPayment();
    } catch (error) {
      if (error instanceof HttpError && error.code === "SLOT_TAKEN") {
        const current = await schedule.refetch();
        if (data.time && current.data && !isTimeAvailable(current.data.mode, current.data.days, data.time))
          prepare.reset();
        if (current.data && requiresReceivingTime(current.data.mode, current.data.days)) onTime();
      }
    }
  }

  return (
    <>
      {prepare.error && <Card role="alert">{prepare.error.message}</Card>}
      {currentUpdate && !needsTime && (
        <Card role="alert">
          <p>Условия заказа изменились</p>
          <p>Было {formatMinor(total.totalMinor, total.currency)}</p>
          <p>Стало {formatMinor(currentUpdate.totalMinor, currentUpdate.currency)}</p>
          <Button full disabled={checking || !!timeError} onClick={toPayment}>
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
          disabled={checking || !!timeError || !!currentUpdate}
          subtitle={
            schedule.data?.mode === "after_order"
              ? "Дату и время согласуем после заказа"
              : schedulingLater
                ? "Время уточнит магазин после заказа"
                : deliveryLabel(data.availability, total.currency)
          }
          onClick={() => void next()}
        >
          {needsTime ? "Выбрать время" : `К оплате · ${formatMinor(total.totalMinor, total.currency)}`}
        </Button>
      </StickyFooter>
    </>
  );
}
