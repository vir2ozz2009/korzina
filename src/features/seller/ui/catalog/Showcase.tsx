import { useRef, useState } from "react";
import { QueryBoundary } from "../../../../app/shell/QueryBoundary";
import { useToast } from "../../../../app/shell/ToastProvider";
import { categoryMosaic } from "../../../../shared/catalog/mosaic";
import type { CatalogCategorySize } from "../../../../shared/contracts/catalog";
import type { SellerCategoryOrder, SellerGroup } from "../../../../shared/contracts/seller-catalog";
import { Button } from "../../../../ui/Button";
import { CategoryRail } from "../../../../ui/CategoryRail";
import { CategoryTile } from "../../../../ui/CategoryTile";
import { EmptyState } from "../../../../ui/EmptyState";
import { useCatalogCommand, useCatalogGroups } from "../../catalog-api";
import { CatalogEditorFrame, type CatalogFrame } from "./CatalogEditorFrame";
import { displayImage } from "./CatalogPhotos";
import { useCatalogNav } from "./navigation";

const options = [
  ["1x1", "Маленькая"],
  ["2x1", "Широкая"],
  ["1x2", "Высокая"],
  ["2x2", "Большая"],
] as const;

export function Showcase({ store, frame, canWrite }: { store: string; frame: CatalogFrame; canWrite: boolean }) {
  const query = useCatalogGroups(store, "categories");
  return (
    <QueryBoundary query={query} template="form">
      {({ groups }) => (
        <Mosaic
          store={store}
          frame={frame}
          canWrite={canWrite}
          original={groups.filter((row) => row.parentId === null && row.onStorefront && row.hasStorefrontProducts)}
        />
      )}
    </QueryBoundary>
  );
}

function Mosaic({
  store,
  frame,
  canWrite,
  original,
}: {
  store: string;
  frame: CatalogFrame;
  canWrite: boolean;
  original: SellerGroup[];
}) {
  const nav = useCatalogNav(store);
  const toast = useToast();
  const command = useCatalogCommand(store);
  const [draft, setDraft] = useState<SellerGroup[]>();
  const [selected, setSelected] = useState<string>();
  const dragging = useRef<string | undefined>(undefined);
  const rows = draft ?? original;
  const selectedRow = rows.find((row) => row.id === selected);
  const placements = categoryMosaic(rows);
  const dirty = !!draft && JSON.stringify(original) !== JSON.stringify(draft);
  function changeSize(id: string, tileSize: CatalogCategorySize) {
    setDraft(placements.map(({ category, size }) => ({ ...category, tileSize: id === category.id ? tileSize : size })));
  }
  function move(from: string, to: string) {
    if (from === to) return;
    const next = placements.map(({ category, size }) => ({ ...category, tileSize: size }));
    const fromIndex = next.findIndex((row) => row.id === from);
    const toIndex = next.findIndex((row) => row.id === to);
    if (fromIndex < 0 || toIndex < 0) return;
    next.splice(toIndex, 0, ...next.splice(fromIndex, 1));
    setDraft(next);
    setSelected(from);
  }
  function save() {
    const input: SellerCategoryOrder = {
      parentId: null,
      mosaic: true,
      categories: placements.map(({ category, size }) => ({
        id: category.id,
        revision: category.revision,
        tileSize: size,
      })),
    };
    command.mutate(
      { path: "/category-order", input },
      {
        onSuccess: () => {
          toast("Сохранено");
          nav.leave("/seller/more", true);
        },
      },
    );
  }
  const current = placements.find(({ category }) => category.id === selected);
  return (
    <CatalogEditorFrame
      store={store}
      fallback="/seller/more"
      frame={frame}
      dirty={canWrite && dirty}
      busy={command.isPending}
      onSave={save}
    >
      {!canWrite && <p className="text-meta">Только просмотр</p>}
      {!rows.length ? (
        <EmptyState title="Нет категорий на витрине" />
      ) : (
        <>
          <h2 className="text-title-3">Категории</h2>
          <CategoryRail>
            {placements.map(({ category, row, column, size }, index) => (
              <div
                key={category.id}
                data-mosaic-id={category.id}
                className="relative min-w-0 rounded-lg"
                style={{ gridColumn: `${column}/span ${size[0]}`, gridRow: `${row}/span ${size[2]}` }}
              >
                <CategoryTile name={category.name} size={size} image={displayImage(category.image) ?? undefined} />
                {canWrite && (
                  <button
                    type="button"
                    className={`absolute inset-0 z-10 cursor-grab rounded-lg ${selected === category.id ? "touch-none ring-2 ring-inset ring-primary" : ""}`}
                    aria-label={category.name}
                    aria-pressed={selected === category.id}
                    draggable={canWrite}
                    onClick={() => setSelected(category.id)}
                    onDragOver={(event) => {
                      if (dragging.current) event.preventDefault();
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (dragging.current) move(dragging.current, category.id);
                    }}
                    onDragStart={(event) => {
                      dragging.current = category.id;
                      event.dataTransfer.setData("text/plain", category.id);
                    }}
                    onDragEnd={() => {
                      dragging.current = undefined;
                    }}
                    onPointerDown={(event) => {
                      if (selected === category.id && event.pointerType !== "mouse")
                        event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onPointerUp={(event) => {
                      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                      const target = document
                        .elementFromPoint(event.clientX, event.clientY)
                        ?.closest<HTMLElement>("[data-mosaic-id]");
                      if (target?.dataset.mosaicId) move(category.id, target.dataset.mosaicId);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                      event.preventDefault();
                      const target = rows[index + (event.key === "ArrowLeft" ? -1 : 1)];
                      if (target) move(category.id, target.id);
                    }}
                  />
                )}
              </div>
            ))}
          </CategoryRail>
          {selectedRow && canWrite && (
            <fieldset
              aria-label={`Размер плитки «${selectedRow.name}»`}
              className="grid grid-cols-2 gap-2 rounded-xl bg-card p-3"
            >
              {options.map(([size, label]) => (
                <Button
                  key={size}
                  variant={current?.size === size ? "soft" : "secondary"}
                  aria-pressed={current?.size === size}
                  disabled={command.isPending}
                  icon={<TileShape size={size} />}
                  onClick={() => changeSize(selectedRow.id, size)}
                >
                  {label}
                </Button>
              ))}
            </fieldset>
          )}
        </>
      )}
      {command.error && <p role="alert">{command.error.message}</p>}
    </CatalogEditorFrame>
  );
}

function TileShape({ size }: { size: CatalogCategorySize }) {
  return (
    <span aria-hidden className="grid h-7 w-9 grid-cols-2 grid-rows-2 gap-0.5 rounded-sm border border-border p-0.5">
      <span
        className={`rounded-xs bg-current ${size[0] === "2" ? "col-span-2" : ""} ${size[2] === "2" ? "row-span-2" : ""}`}
      />
    </span>
  );
}
