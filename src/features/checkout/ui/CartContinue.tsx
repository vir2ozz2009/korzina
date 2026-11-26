import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { telegramLaunch } from "../../../app/telegram/launch";
import { formatMinor } from "../../../shared/money";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { useContact } from "../../contact";
import { activeReceiving, useReceiving, useSaveReceiving } from "../../receiving";
import type { usePurchaseSummary } from "../api";
import { CartContinueButton } from "./CartContinueButton";

export function CartContinue({
  revision,
  summary,
  disabled,
  address,
  contact,
}: {
  revision: number;
  summary: ReturnType<typeof usePurchaseSummary>;
  disabled: boolean;
  address: () => void;
  contact: () => void;
}) {
  const navigate = useNavigate();
  const receiving = useReceiving();
  const buyer = useContact();
  const save = useSaveReceiving();
  const [error, setError] = useState("");
  const data = summary.isFetching || summary.isError ? undefined : summary.data;
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
        <CartContinueButton
          disabled={disabled || !method || !buyer.data || receiving.isFetching}
          loading={save.isPending}
          subtitle={
            needsAddress
              ? "Укажите адрес доставки"
              : needsContact
                ? "Войдите через Telegram или укажите номер"
                : undefined
          }
          amount={formatMinor(data.totalMinor, currency)}
          onClick={() => void next()}
        />
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
