import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { telegramLaunch } from "../../../app/telegram/launch";
import { formatMinor } from "../../../shared/money";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { StickyFooter } from "../../../ui/StickyFooter";
import { useContact } from "../../contact";
import { activeReceiving, useReceiving, useSaveReceiving } from "../../receiving";
import { usePurchaseSummary } from "../api";

export function CartContinue({
  revision,
  disabled,
  address,
  contact,
}: {
  revision: number;
  disabled: boolean;
  address: () => void;
  contact: () => void;
}) {
  const navigate = useNavigate();
  const summary = usePurchaseSummary(revision);
  const receiving = useReceiving();
  const buyer = useContact();
  const save = useSaveReceiving();
  const [error, setError] = useState("");
  const data = summary.data;
  const selection = receiving.data;
  if (!data?.currency || !selection)
    return summary.isError ? (
      <Card role="alert">
        Не удалось пересчитать заказ{" "}
        <Button variant="secondary" onClick={() => void summary.refetch()}>
          Повторить
        </Button>
      </Card>
    ) : null;
  if (!data.acceptingOrders) return null;

  const currency = data.currency;
  const method = activeReceiving(selection);
  const needsAddress =
    method === "delivery" && (selection.receiving?.mode !== "delivery" || !selection.availability?.available);
  const needsContact = !!buyer.data && !buyer.data.phone && !buyer.data.telegramLinked;
  const courier =
    data.availability?.mode === "delivery" && data.availability.available && data.availability.payee === "courier";

  async function next() {
    if (needsAddress) return address();
    if (needsContact) return contact();
    if (method === "pickup" && selection?.receiving?.mode !== "pickup") {
      try {
        await save.mutateAsync({ receiving: { mode: "pickup" }, expectedRevision: revision });
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Не удалось выбрать самовывоз");
        return;
      }
    }
    await navigate({ to: "/checkout/receiving", search: (previous) => ({ shop: previous.shop }) });
  }

  return (
    <>
      {data.deliveryMinor > 0 || courier ? (
        <Card className="flex items-center justify-between gap-2">
          <span>{courier ? "К оплате магазину" : "Итого с доставкой"}</span>
          <strong>{formatMinor(data.totalMinor, currency)}</strong>
        </Card>
      ) : null}
      {data.shortMinor > 0 ? (
        <Card role="status">
          <p>Добавьте товаров ещё на {formatMinor(data.shortMinor, currency)}</p>
          <p className="text-meta text-muted-foreground">
            Минимальная сумма товаров — {formatMinor(data.minimumMinor, currency)}
          </p>
          <Button
            full
            variant="secondary"
            onClick={() => void navigate({ to: "/", search: (previous) => ({ shop: previous.shop }) })}
          >
            К товарам
          </Button>
        </Card>
      ) : (
        <StickyFooter floating>
          <Button
            full
            size="xl"
            className="shadow-float"
            loading={save.isPending}
            disabled={
              disabled || !method || !buyer.data || summary.isError || summary.isFetching || receiving.isFetching
            }
            subtitle={
              needsAddress
                ? "Укажите адрес доставки"
                : needsContact
                  ? "Войдите через Telegram или укажите номер"
                  : undefined
            }
            onClick={() => void next()}
          >
            {needsAddress || needsContact
              ? "К времени и оплате"
              : `Продолжить · ${formatMinor(data.totalMinor, currency)}`}
          </Button>
        </StickyFooter>
      )}
      {error && <Card role="alert">{error}</Card>}
      {buyer.isError && (
        <Card role="alert">
          <p>{telegramLaunch ? "Не удалось проверить вход" : "Не удалось проверить контакт"}</p>
          <Button variant="secondary" onClick={() => void buyer.refetch()}>
            Повторить
          </Button>
        </Card>
      )}
    </>
  );
}
