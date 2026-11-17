import { useState } from "react";
import { ListItem } from "./ListItem";
import { Radio } from "./Radio";
import { Sheet } from "./Sheet";
export function Select({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string; disabled?: boolean }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className={disabled ? "opacity-40" : ""}>
        <ListItem
          title={label}
          value={`${options.find((option) => option.value === value)?.label ?? "Выбрать"} ›`}
          onClick={disabled ? undefined : () => setOpen(true)}
        />
      </div>
      <Sheet open={open} onOpenChange={setOpen} title={label}>
        <fieldset className="space-y-2">
          {options.map((option) => (
            <Radio
              key={option.value}
              name={label}
              label={option.label}
              value={option.value}
              disabled={option.disabled}
              checked={value === option.value}
              onChange={() => {
                onChange(option.value);
                setOpen(false);
              }}
            />
          ))}
        </fieldset>
      </Sheet>
    </>
  );
}
