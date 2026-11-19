import type { DeliveryAddress, DetailField } from "../../../shared/contracts/receiving";
import { Input } from "../../../ui/Input";
import { Select } from "../../../ui/Select";
import { TextArea } from "../../../ui/TextArea";

export const addressFields = {
  apartment: "Квартира",
  entrance: "Подъезд",
  floor: "Этаж",
  intercom: "Домофон",
} as const;

export function ManualAddressFields({
  value,
  manual,
  required,
  disabled,
  invalid,
  idPrefix,
  onChange,
}: {
  value: DeliveryAddress;
  manual?: { districts: { id: string; name: string }[] };
  required: readonly DetailField[];
  disabled?: boolean;
  invalid?: DetailField;
  idPrefix?: string;
  onChange: (address: DeliveryAddress) => void;
}) {
  return (
    <>
      {!!manual?.districts.length && (
        <Select
          label="Район"
          value={value.districtId ?? ""}
          disabled={disabled}
          options={manual.districts.map(({ id, name }) => ({ value: id, label: name }))}
          onChange={(districtId) => onChange({ ...value, districtId })}
        />
      )}
      {manual && (
        <TextArea
          label="Адрес доставки"
          value={value.address}
          disabled={disabled}
          aria-required
          maxLength={300}
          onChange={(event) => onChange({ ...value, address: event.target.value })}
        />
      )}
      {required.map((field) => (
        <Input
          key={field}
          id={idPrefix ? `${idPrefix}-${field}` : undefined}
          label={manual ? `${addressFields[field]} *` : addressFields[field]}
          error={invalid === field ? "Заполните это поле" : undefined}
          value={value[field] ?? ""}
          disabled={disabled}
          maxLength={80}
          onChange={(event) => onChange({ ...value, [field]: event.target.value })}
        />
      ))}
    </>
  );
}
