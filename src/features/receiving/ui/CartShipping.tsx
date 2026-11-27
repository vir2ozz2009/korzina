import { MapPin, Store, Truck } from "lucide-react";
import { useEffect, useRef } from "react";
import { useToast } from "../../../app/shell/ToastProvider";
import type { Receiving } from "../../../shared/contracts/receiving";
import { HttpError } from "../../../shared/http-error";
import { Card } from "../../../ui/Card";
import { ListItem } from "../../../ui/ListItem";
import { type ReceivingState, useReceiving, useSaveReceiving } from "../api";
import { canReuseAddress } from "../reuse-address";
import { AddressSheet } from "./AddressSheet";

export function activeReceiving(
  data: Pick<ReceivingState, "receiving" | "delivery" | "pickup" | "unavailable"> & {
    effectiveMode?: "delivery" | "pickup" | null;
  },
) {
  if ("effectiveMode" in data) return data.effectiveMode ?? undefined;
  if (data.receiving && data[data.receiving.mode] && !data.unavailable?.[data.receiving.mode])
    return data.receiving.mode;
  if (data.delivery && !data.unavailable?.delivery) return "delivery";
  if (data.pickup && !data.unavailable?.pickup) return "pickup";
}

export function CartShipping({
  disabled,
  currency,
  revision,
  open,
  setOpen,
}: {
  disabled: boolean;
  currency: string;
  revision: number;
  open: boolean;
  setOpen: (value: boolean) => void;
}) {
  const query = useReceiving();
  const save = useSaveReceiving();
  const toast = useToast();
  const data = query.data;
  const attempted = useRef<number | undefined>(undefined);
  const previous = data?.lastUsedAddress;
  const { mutate } = save;
  useEffect(() => {
    if (
      !data?.delivery ||
      data.unavailable?.delivery ||
      data.receiving ||
      !previous ||
      !canReuseAddress(previous, data) ||
      disabled ||
      open ||
      attempted.current === revision
    )
      return;
    attempted.current = revision;
    mutate({ receiving: { ...previous, comment: undefined }, expectedRevision: Math.max(revision, data.revision) });
  }, [data, previous, disabled, open, revision, mutate]);
  if (!data) {
    return query.isError ? (
      <ListItem title="Не удалось проверить доставку" value="Повторить" onClick={() => void query.refetch()} />
    ) : null;
  }
  const address = data.receiving?.mode === "delivery" ? data.receiving : undefined;
  const blocked = disabled || save.isPending;
  const update = (receiving: Receiving) =>
    save.mutateAsync({ receiving, expectedRevision: Math.max(revision, data.revision) });
  async function choose(next: "delivery" | "pickup") {
    try {
      if (next === "pickup") {
        await update({ mode: "pickup" });
        setOpen(false);
      } else if (data?.deliveryDraft && canReuseAddress(data.deliveryDraft, data)) {
        await update(data.deliveryDraft);
      } else {
        await save.mutateAsync({ mode: "delivery", expectedRevision: Math.max(revision, data?.revision ?? 0) });
        setOpen(true);
      }
    } catch (error) {
      if (next === "delivery" && error instanceof HttpError && error.code === "OUT_OF_ZONE") setOpen(true);
      else toast(error instanceof Error ? error.message : "Не удалось сохранить способ получения");
    }
  }
  return (
    <>
      <CartShippingView
        data={data}
        blocked={blocked}
        choose={(mode) => void choose(mode)}
        editAddress={() => setOpen(true)}
      />
      {open && data.delivery && (
        <AddressSheet
          current={address ?? data.deliveryDraft}
          editCurrent={!!address}
          data={data}
          currency={currency}
          pending={save.isPending}
          close={() => setOpen(false)}
          save={async (selected) => {
            await update(selected);
            setOpen(false);
          }}
          pickup={data.pickup && !data.unavailable?.pickup ? () => void choose("pickup") : undefined}
        />
      )}
    </>
  );
}

export function CartShippingView({
  data,
  blocked,
  choose,
  editAddress,
}: {
  data: Pick<
    ReceivingState,
    "delivery" | "pickup" | "receiving" | "unavailable" | "acceptingOrders" | "closedMessage" | "availability"
  >;
  blocked?: boolean;
  choose?: (mode: "pickup" | "delivery") => void;
  editAddress?: () => void;
}) {
  const method = activeReceiving(data);
  const address = data.receiving?.mode === "delivery" ? data.receiving : undefined;
  const addressStatus = data.availability?.available
    ? address?.acceptedWithoutPoint
      ? "Условия доставки уточняются"
      : "Адрес доставки"
    : "Нужно проверить адрес";
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
  return (
    <>
      {!data.acceptingOrders && (
        <Card role="status">{data.closedMessage ?? "Магазин временно не принимает заказы"}</Card>
      )}
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
                disabled={!!data.unavailable?.[mode]}
                onChange={() => choose?.(mode)}
              />
              <Icon size={24} aria-hidden />
              <span className="mt-2 block text-label">{title}</span>
              <span className="mt-1 block text-small text-foreground-body">
                {data.unavailable?.[mode] ?? description}
              </span>
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
            {data.unavailable?.[mode] && <p className="text-small">{data.unavailable[mode]}</p>}
          </Card>
        ))
      )}
      {!methods.length && <Card role="status">Получение пока недоступно</Card>}
      {method === "delivery" && (
        <ListItem
          title={address?.address || "Укажите адрес доставки"}
          subtitle={
            address
              ? [address.apartment && `кв. ${address.apartment}`, addressStatus].filter(Boolean).join(" · ")
              : undefined
          }
          icon={<MapPin size={22} />}
          onClick={blocked ? undefined : editAddress}
        />
      )}
      {method === "pickup" && data.pickup && <ListItem title={data.pickup.address} subtitle={data.pickup.hours} />}
    </>
  );
}
