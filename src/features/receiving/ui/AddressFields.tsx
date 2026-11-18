import type { DetailField, Receiving } from "../../../shared/contracts/receiving";
import { Input } from "../../../ui/Input";
import { Select } from "../../../ui/Select";
import { TextArea } from "../../../ui/TextArea";

export const addressFields = {
  apartment: "Квартира",
  entrance: "Подъезд",
  floor: "Этаж",
  intercom: "Домофон",
} as const;
type Address = Extract<Receiving, { mode: "delivery" }>;

export function ManualAddressFields({
  value,
  label,
  districts,
  required,
  disabled,
  onChange,
}: {
  value: Address;
  label?: string;
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
        label={label ?? "Адрес доставки"}
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
