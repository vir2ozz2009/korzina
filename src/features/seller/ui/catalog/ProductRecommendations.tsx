import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import { QueryBoundary } from "../../../../app/shell/QueryBoundary";
import { Button } from "../../../../ui/Button";
import { Checkbox } from "../../../../ui/Checkbox";
import { IconButton } from "../../../../ui/IconButton";
import { SearchField } from "../../../../ui/SearchField";
import { Sheet } from "../../../../ui/Sheet";
import { fetchCatalogProduct, useCatalogProducts } from "../../catalog-api";

export function ProductRecommendations({
  store,
  productId,
  initial,
  onConfirm,
  onClose,
}: {
  store: string;
  productId?: string;
  initial: string[];
  onConfirm: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [query, search] = useState("");
  const [selected, setSelected] = useState(initial);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const dragging = useRef<string | undefined>(undefined);
  const products = useCatalogProducts(store, { q: useDeferredValue(query) });
  const rows = products.data?.pages.flatMap((page) => page.items).filter((row) => row.id !== productId) ?? [];
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all(
      initial.map((id) =>
        fetchCatalogProduct(store, id, controller.signal)
          .then((product) => [id, product.name] as const)
          .catch(() => [id, "Недоступный товар"] as const),
      ),
    ).then((items) => {
      if (!controller.signal.aborted) setLabels(Object.fromEntries(items));
    });
    return () => controller.abort();
  }, [store, initial]);
  function move(from: string, to: string) {
    if (from === to || !selected.includes(from) || !selected.includes(to)) return;
    const next = [...selected];
    next.splice(selected.indexOf(to), 0, ...next.splice(selected.indexOf(from), 1));
    setSelected(next);
  }
  return (
    <Sheet
      open
      title="Рекомендации вручную"
      description={`Выбрано: ${selected.length} из 10`}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      form
    >
      <div className="space-y-3">
        {!!selected.length && (
          <ol aria-label="Порядок рекомендаций" className="space-y-1">
            {selected.map((id, index) => {
              const name = rows.find((row) => row.id === id)?.name ?? labels[id] ?? "Товар";
              return (
                <li
                  key={id}
                  data-recommendation-id={id}
                  className="flex items-center gap-1 rounded-lg bg-input pl-2"
                  onDragOver={(event) => {
                    if (dragging.current) event.preventDefault();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (dragging.current) move(dragging.current, id);
                  }}
                >
                  <button
                    type="button"
                    draggable
                    aria-label={`Перетащить: ${name}`}
                    className="grid min-h-11 min-w-11 touch-none cursor-grab place-items-center"
                    onDragStart={(event) => {
                      dragging.current = id;
                      event.dataTransfer.setData("text/plain", id);
                    }}
                    onDragEnd={() => {
                      dragging.current = undefined;
                    }}
                    onPointerDown={(event) => {
                      if (event.pointerType !== "mouse") event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onPointerUp={(event) => {
                      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                      const target = document
                        .elementFromPoint(event.clientX, event.clientY)
                        ?.closest<HTMLElement>("[data-recommendation-id]");
                      if (target?.dataset.recommendationId) move(id, target.dataset.recommendationId);
                    }}
                  >
                    <GripVertical size={16} />
                  </button>
                  <span className="min-w-0 flex-1 text-caption">{name}</span>
                  <IconButton
                    aria-label={`${name}: выше`}
                    disabled={index === 0}
                    onClick={() => move(id, selected[index - 1])}
                  >
                    <ArrowUp size={16} />
                  </IconButton>
                  <IconButton
                    aria-label={`${name}: ниже`}
                    disabled={index + 1 === selected.length}
                    onClick={() => move(id, selected[index + 1])}
                  >
                    <ArrowDown size={16} />
                  </IconButton>
                  <Button
                    variant="ghost"
                    aria-label={`Убрать: ${name}`}
                    onClick={() => setSelected(selected.filter((item) => item !== id))}
                  >
                    ×
                  </Button>
                </li>
              );
            })}
          </ol>
        )}
        <SearchField value={query} onChange={search} />
        <QueryBoundary query={products} template="list">
          {() => (
            <fieldset aria-label="Товары для рекомендаций">
              {rows.map((row) => {
                const checked = selected.includes(row.id);
                return (
                  <Checkbox
                    key={row.id}
                    label={row.status === "hidden" ? `${row.name} · Скрыт` : row.name}
                    checked={checked}
                    disabled={!checked && selected.length >= 10}
                    onChange={(event) => {
                      setLabels({ ...labels, [row.id]: row.name });
                      setSelected(
                        event.target.checked ? [...selected, row.id] : selected.filter((id) => id !== row.id),
                      );
                    }}
                  />
                );
              })}
              {products.hasNextPage && (
                <Button loading={products.isFetchingNextPage} onClick={() => void products.fetchNextPage()}>
                  Показать ещё
                </Button>
              )}
            </fieldset>
          )}
        </QueryBoundary>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onClose}>
            Отменить
          </Button>
          <Button onClick={() => onConfirm(selected)}>Готово</Button>
        </div>
      </div>
    </Sheet>
  );
}
