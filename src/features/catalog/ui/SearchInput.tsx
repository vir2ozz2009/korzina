import { Search, X } from "lucide-react";
import type { Ref } from "react";
import { IconButton } from "../../../ui/IconButton";

export function SearchInput({
  field,
  query,
  invalid,
  onChange,
  onClear,
  onSubmit,
}: {
  field: Ref<HTMLTextAreaElement>;
  query: string;
  invalid: boolean;
  onChange: (value: string) => void;
  onClear: () => void;
  onSubmit: () => void;
}) {
  return (
    <form
      className="flex min-h-11 items-center rounded-xl bg-card p-1"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <IconButton type="submit" aria-label="Искать товары">
        <Search size={20} />
      </IconButton>
      <textarea
        ref={field}
        data-search-input
        aria-label="Поиск товаров"
        rows={Math.min(3, query.split("\n").length)}
        aria-invalid={invalid || undefined}
        className="max-h-[4.5em] min-w-0 grow resize-none bg-transparent text-body outline-none [field-sizing:content]"
        placeholder="Товар, список или блюдо"
        value={query}
        onChange={(event) => onChange(event.target.value)}
      />
      {query && (
        <IconButton type="button" aria-label="Очистить запрос" onClick={onClear}>
          <X size={19} />
        </IconButton>
      )}
    </form>
  );
}
