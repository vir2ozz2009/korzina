import { MapPin, Store, Truck } from "lucide-react";
import { useToast } from "../../../app/shell/ToastProvider";
import type { Receiving, ReceivingAvailability } from "../../../shared/contracts/receiving";
import { formatMinor } from "../../../shared/money";
import { Card } from "../../../ui/Card";
import { ListItem } from "../../../ui/ListItem";
import { Sheet } from "../../../ui/Sheet";
import { type ReceivingState, useReceiving, useSaveReceiving } from "../api";
import { AddressSheet } from "./AddressSheet";

function deliveryLabel(result: ReceivingAvailability | null, currency: string) {
  if (result?.mode === "pickup" && result.available) return "Самовывоз бесплатно";
  if (result?.mode !== "delivery" || !result.available) return "Рассчитаем по адресу";
  if (result.tariff === "free") return "Бесплатно";
  if (result.payee === "courier") {
    const cost = result.unverified
      ? "уточнит магазин"
      : result.feeMinor === null
        ? "по тарифу службы"
        : formatMinor(result.feeMinor, currency);
    return `Оплата курьеру · ${cost}`;
  }
  return result.feeMinor === null ? "Согласуем после заказа" : formatMinor(result.feeMinor, currency);
}

function activeReceiving(data: ReceivingState) {
  if (data.receiving && data[data.receiving.mode]) return data.receiving.mode;
  return data.delivery ? "delivery" : data.pickup ? "pickup" : undefined;
}

export function CartShipping({
  currency,
  disabled,
  revision,
  open,
  setOpen,
}: {
  currency: string;
  disabled: boolean;
  revision: number;
  open: boolean;
  setOpen: (value: boolean) => void;
}) {
  const query = useReceiving();
  const save = useSaveReceiving();
  const toast = useToast();
  const data = query.data;
  if (!data) {
    return query.isError ? (
      <ListItem title="Не удалось проверить доставку" value="Повторить" onClick={() => void query.refetch()} />
    ) : null;
  }
  const method = activeReceiving(data);
  const address = data.receiving?.mode === "delivery" ? data.receiving : undefined;
  const blocked = disabled || save.isPending;
  const update = (receiving: Receiving) =>
    save.mutateAsync({ receiving, expectedRevision: Math.max(revision, data.revision) });
  const methods = [
    {
      enabled: !!data.delivery,
      mode: "delivery" as const,
      title: "Доставка",
      description: "Привезём по адресу",
      Icon: Truck,
    },
    {
      enabled: !!data.pickup,
      mode: "pickup" as const,
      title: "Самовывоз",
      description: data.pickup ? `Заберёте сами · ${data.pickup.address}` : "",
      Icon: Store,
    },
  ].filter(({ enabled }) => enabled);
  async function choose(next: "delivery" | "pickup") {
    try {
      if (next === "pickup") {
        await update({ mode: "pickup" });
        setOpen(false);
      } else {
        setOpen(true);
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : "Не удалось сохранить способ получения");
    }
  }
  return (
    <>
      {!data.acceptingOrders && <Card role="status">Магазин временно не принимает заказы</Card>}
      {methods.length === 2 ? (
        <fieldset aria-label="Способ получения" className="grid grid-cols-2 gap-2" disabled={blocked}>
          {methods.map(({ mode, title, description, Icon }) => (
            <label
              key={mode}
              className={`relative min-w-0 rounded-xl border px-3 py-3 focus-within:outline-2 focus-within:outline-ring ${method === mode ? "border-primary bg-primary-soft" : "border-transparent bg-card"}`}
            >
              <input
                type="radio"
                name="receiving"
                aria-label={title}
                className="absolute inset-0 size-full cursor-pointer opacity-0"
                checked={method === mode}
                onChange={() => void choose(mode)}
              />
              <Icon size={24} aria-hidden />
              <span className="mt-2 block text-label">{title}</span>
              <span className="mt-1 block text-small text-foreground-body">{description}</span>
            </label>
          ))}
        </fieldset>
      ) : (
        methods.map(({ mode, title, Icon }) => (
          <Card key={mode}>
            <div className="flex items-center gap-3">
              <Icon aria-hidden size={22} />
              <h2 className="text-title-3">{title}</h2>
            </div>
          </Card>
        ))
      )}
      {!methods.length && <Card role="status">Получение пока недоступно</Card>}
      {method === "delivery" && (
        <ListItem
          title={address?.address || "Укажите адрес доставки"}
          subtitle={address ? (data.availability?.available ? "Адрес доставки" : "Нужно проверить адрес") : undefined}
          icon={<MapPin size={22} />}
          onClick={blocked ? undefined : () => setOpen(true)}
        />
      )}
      {method === "pickup" && data.pickup && <ListItem title={data.pickup.address} subtitle={data.pickup.hours} />}
      {method && (
        <ListItem
          title="Доставка"
          value={method === "pickup" ? "Самовывоз бесплатно" : deliveryLabel(data.availability, currency)}
        />
      )}
      <Sheet open={open && !!data.delivery} onOpenChange={setOpen} title="Адрес доставки">
        {open && (
          <AddressSheet
            current={address ?? data.lastUsedAddress}
            data={data}
            pending={save.isPending}
            save={async (selected) => {
              await update(selected);
              setOpen(false);
            }}
            pickup={data.pickup ? () => void choose("pickup") : undefined}
          />
        )}
      </Sheet>
    </>
  );
}
