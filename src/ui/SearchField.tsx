import { Search, X } from "lucide-react";
import { useId } from "react";
import { IconButton } from "./IconButton";
export function SearchField({
  value,
  onChange,
  label = "Поиск товаров",
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div
      data-field-surface
      className={`flex min-h-11 items-center gap-2 rounded-pill bg-input pl-4 ${disabled ? "opacity-40" : ""}`}
    >
      <Search size={20} className="shrink-0 text-muted-foreground" />
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="search"
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={label}
        className="min-w-0 flex-1 bg-transparent text-body focus:text-body-lg"
      />
      {value && (
        <IconButton aria-label="Очистить поиск" disabled={disabled} onClick={() => onChange("")}>
          <X size={18} />
        </IconButton>
      )}
    </div>
  );
}
