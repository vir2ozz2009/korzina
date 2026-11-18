import { LocateFixed } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import type { DetailField, Point, Receiving } from "../../../shared/contracts/receiving";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { Input } from "../../../ui/Input";
import { Select } from "../../../ui/Select";
import { SkeletonBlock } from "../../../ui/SkeletonBlock";
import { TextArea } from "../../../ui/TextArea";

const AddressMap = lazy(() => import("./AddressMap").then((module) => ({ default: module.AddressMap })));
export const addressFields = {
  apartment: "Квартира",
  entrance: "Подъезд",
  floor: "Этаж",
  intercom: "Домофон",
} as const;
type Address = Extract<Receiving, { mode: "delivery" }>;

export function ManualAddressFields({
  value,
  districts,
  required,
  disabled,
  onChange,
}: {
  value: Address;
  districts: { id: string; name: string }[];
  required: readonly DetailField[];
  disabled: boolean;
  onChange: (address: Address) => void;
}) {
  return (
    <>
      {!!districts.length && (
        <Select
          label="Район"
          value={value.districtId ?? ""}
          disabled={disabled}
          options={districts.map(({ id, name }) => ({ value: id, label: name }))}
          onChange={(districtId) => onChange({ ...value, districtId })}
        />
      )}
      <TextArea
        label="Адрес доставки"
        value={value.address}
        disabled={disabled}
        aria-required
        maxLength={300}
        onChange={(event) => onChange({ ...value, address: event.target.value })}
      />
      {required.map((field) => (
        <Input
          key={field}
          label={`${addressFields[field]} *`}
          value={value[field] ?? ""}
          disabled={disabled}
          maxLength={80}
          onChange={(event) => onChange({ ...value, [field]: event.target.value })}
        />
      ))}
    </>
  );
}

export function MapAddressTools({
  point,
  disabled,
  frozen,
  locating,
  locate,
  pick,
  enterManual,
}: {
  point?: Point;
  disabled: boolean;
  frozen: boolean;
  locating: boolean;
  locate: () => void;
  pick: (point: Point) => void;
  enterManual: () => void;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <>
      <Suspense fallback={<SkeletonBlock className="h-44" />}>
        <AddressMap point={point} select={pick} onUnavailable={() => setFailed(true)} />
      </Suspense>
      {failed && (
        <p role="status" className="text-meta">
          Карта не загрузилась
        </p>
      )}
      {!frozen && (
        <Button
          full
          variant="secondary"
          icon={<LocateFixed size={18} />}
          loading={locating}
          disabled={disabled || !navigator.geolocation}
          onClick={locate}
        >
          Определить мою позицию
        </Button>
      )}
      <button
        type="button"
        className="min-h-10 px-2 text-small text-primary-strong underline"
        disabled={disabled}
        onClick={enterManual}
      >
        Ввести адрес вручную
      </button>
    </>
  );
}

export function AddressConfirmation({
  address,
  candidate,
  label,
  disabled,
  pending,
  confirm,
  edit,
  manual,
}: {
  address: string;
  candidate?: string;
  label: string;
  disabled: boolean;
  pending: boolean;
  confirm: () => void;
  edit?: () => void;
  manual: boolean;
}) {
  return (
    <Card className="bg-secondary">
      {candidate && <p className="text-label">Проверьте адрес</p>}
      <Button full disabled={!address || disabled} loading={pending} onClick={confirm}>
        {label}
      </Button>
      {edit && (
        <Button full variant="ghost" disabled={disabled} onClick={edit}>
          {manual ? "Найти на карте" : "Исправить адрес"}
        </Button>
      )}
    </Card>
  );
}
