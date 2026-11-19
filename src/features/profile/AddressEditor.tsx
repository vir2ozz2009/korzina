import { useRef, useState } from "react";
import type { AddressCommand, SavedAddress } from "../../shared/contracts/profile";
import type { DeliveryAddress, DetailField } from "../../shared/contracts/receiving";
import { HttpError } from "../../shared/http-error";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { ListItem } from "../../ui/ListItem";
import { Sheet } from "../../ui/Sheet";
import { useCart } from "../cart";
import { AddressSheet, useReceiving } from "../receiving";
import { useAddresses, useEditAddress } from "./api";

const labels: Record<DetailField, string> = {
  apartment: "Квартира",
  entrance: "Подъезд",
  floor: "Этаж",
  intercom: "Домофон",
};

export function AddressEditor({ initial, close }: { initial?: SavedAddress; close: () => void }) {
  const [name, setName] = useState(initial?.title ?? "");
  const [address, setAddress] = useState<DeliveryAddress | undefined>(initial);
  const [location, setLocation] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [missing, setMissing] = useState<DetailField>();
  const { query } = useCart();
  const data = useReceiving();
  const addresses = useAddresses();
  const edit = useEditAddress();
  const attempt = useRef<{ signature: string; key: string }>(undefined);
  const send = (input: AddressCommand) => {
    const signature = JSON.stringify(input);
    if (attempt.current?.signature !== signature) attempt.current = { signature, key: crypto.randomUUID() };
    edit.mutate(
      { input, key: attempt.current.key },
      {
        onSuccess: close,
        onError: (error) => {
          if (error instanceof HttpError && error.code === "VERSION_CONFLICT") void addresses.refetch();
        },
      },
    );
  };
  const remove = () => {
    if (initial && addresses.data) send({ action: "remove", id: initial.id, revision: addresses.data.revision });
  };
  const save = () => {
    if (!address || !addresses.data || edit.isPending) return;
    const field = data.data?.requiredDetails.find((key) => !address[key]?.trim());
    if (field) {
      setMissing(field);
      document.getElementById(`profile-address-${field}`)?.focus();
      return;
    }
    send({ action: "save", revision: addresses.data.revision, id: initial?.id, title: name, receiving: address });
  };
  return (
    <>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <Input label="Название" value={name} maxLength={50} onChange={(event) => setName(event.target.value)} />
        <ListItem
          title="Адрес доставки"
          subtitle={address?.address}
          value={address ? "Изменить" : "Выбрать"}
          onClick={data.data?.delivery ? () => setLocation(true) : undefined}
        />
        {data.isError && (
          <Button full variant="secondary" onClick={() => void data.refetch()}>
            Повторить
          </Button>
        )}
        {data.data && !data.data.delivery && <p>Доставка недоступна</p>}
        {address &&
          data.data?.requiredDetails.map((field) => (
            <Input
              key={field}
              id={`profile-address-${field}`}
              label={labels[field]}
              value={address[field] ?? ""}
              maxLength={80}
              error={missing === field ? "Заполните это поле" : undefined}
              onChange={(event) => {
                setAddress({ ...address, [field]: event.target.value });
                setMissing(undefined);
              }}
            />
          ))}
        {edit.isError && !confirm && <p role="alert">{edit.error.message || "Не удалось сохранить адрес"}</p>}
        <Button full type="submit" loading={edit.isPending && !confirm} disabled={!address || !data.data?.delivery}>
          Сохранить
        </Button>
        {initial && (
          <Button
            full
            variant="secondary"
            disabled={edit.isPending}
            onClick={() => {
              edit.reset();
              setConfirm(true);
            }}
          >
            Удалить адрес
          </Button>
        )}
      </form>
      {location && data.data && (
        <AddressSheet
          data={data.data}
          edit
          current={address}
          currency={query.data?.currency ?? ""}
          pending={false}
          close={() => setLocation(false)}
          save={async (value) => {
            setAddress(value);
            setLocation(false);
          }}
        />
      )}
      {confirm && initial && (
        <Sheet
          open
          title={`Удалить адрес ${initial.title || initial.address}?`}
          onOpenChange={(open) => {
            if (!open && !edit.isPending) setConfirm(false);
          }}
        >
          <div className="space-y-2">
            {edit.isError && <p role="alert">{edit.error.message || "Не удалось удалить адрес"}</p>}
            <Button full loading={edit.isPending} onClick={remove}>
              {edit.isError ? "Повторить" : "Удалить"}
            </Button>
            <Button full variant="secondary" disabled={edit.isPending} onClick={() => setConfirm(false)}>
              Отмена
            </Button>
          </div>
        </Sheet>
      )}
    </>
  );
}
