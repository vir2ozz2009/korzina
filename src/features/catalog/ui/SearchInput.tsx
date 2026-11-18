import { Search, X } from "lucide-react";
import { type Ref, useEffect, useState } from "react";
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
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => setKeyboardOpen(window.innerHeight - viewport.height * viewport.scale > 120);
    update();
    viewport.addEventListener("resize", update);
    window.addEventListener("resize", update);
    return () => {
      viewport.removeEventListener("resize", update);
      window.removeEventListener("resize", update);
    };
  }, []);
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
        data-search-input={keyboardOpen || undefined}
        aria-label="Поиск товаров"
        rows={Math.min(3, query.split("\n").length)}
        aria-invalid={invalid || undefined}
        enterKeyHint="search"
        className="max-h-[4.5em] min-w-0 grow resize-none bg-transparent text-body-lg font-normal focus-visible:outline-muted-foreground aria-invalid:focus-visible:outline-status-danger-foreground [field-sizing:content]"
        placeholder="Товар, список или блюдо"
        value={query}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            onSubmit();
          }
        }}
      />
      {query && (
        <IconButton type="button" aria-label="Очистить запрос" onClick={onClear}>
          <X size={19} />
        </IconButton>
      )}
    </form>
  );
}
