import { Input } from "../../../../ui/Input";

export const promoCountInput = (
  label: string,
  value: number | undefined,
  update: (value: number) => void,
  unlimited?: boolean,
) => (
  <Input
    label={label}
    type="number"
    min={1}
    inputMode="numeric"
    placeholder={unlimited ? "Без ограничений" : undefined}
    value={value ?? ""}
    onChange={(event) => update(Number(event.target.value))}
  />
);
