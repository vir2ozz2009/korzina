import { Chip } from "./Chip";
export function ChipGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: string; label: string; disabled?: boolean }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset aria-label={label} className="flex min-w-0 gap-2 overflow-x-auto py-1">
      {options.map((option) => (
        <Chip
          key={option.value}
          selected={option.value === value}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Chip>
      ))}
    </fieldset>
  );
}
