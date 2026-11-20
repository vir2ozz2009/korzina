import { ArrowDown, ArrowUp, GripVertical, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { QueryBoundary } from "../../../../app/shell/QueryBoundary";
import { useToast } from "../../../../app/shell/ToastProvider";
import type { SellerCategoryOrder, SellerGroup, SellerGroupKind } from "../../../../shared/contracts/seller-catalog";
import { Avatar } from "../../../../ui/Avatar";
import { Button } from "../../../../ui/Button";
import { CategoryPhoto } from "../../../../ui/CategoryPhoto";
import { EmptyState } from "../../../../ui/EmptyState";
import { IconButton } from "../../../../ui/IconButton";
import { ListItem } from "../../../../ui/ListItem";
import { imageSource, type ProductImageValue } from "../../../../ui/product-image";
import { useCatalogCommand, useCatalogGroups } from "../../catalog-api";
import type { CatalogFrame } from "./CatalogEditorFrame";
import { displayImage } from "./CatalogPhotos";
import { useCatalogNav } from "./navigation";

export function CatalogGroups({
  store,
  kind,
  canWrite,
  frame,
}: {
  store: string;
  kind: SellerGroupKind;
  canWrite: boolean;
  frame: CatalogFrame;
}) {
  const query = useCatalogGroups(store, kind);
  const command = useCatalogCommand(store);
  const nav = useCatalogNav(store);
  const toast = useToast();
  const parentId = nav.params.get("parent");
  const dragging = useRef<string | undefined>(undefined);
  const category = kind === "categories";
  function move(items: SellerGroup[], from: string, to: string) {
    if (!canWrite || command.isPending || from === to) return;
    const fromIndex = items.findIndex((row) => row.id === from);
    const toIndex = items.findIndex((row) => row.id === to);
    if (fromIndex < 0 || toIndex < 0) return;
    const rows = [...items];
    rows.splice(toIndex, 0, ...rows.splice(fromIndex, 1));
    const input: SellerCategoryOrder = {
      parentId,
      mosaic: false,
      categories: rows.map(({ id, revision }) => ({ id, revision })),
    };
    command.mutate({ path: "/category-order", input }, { onError: (error) => toast(error.message) });
  }
  return frame(
    <QueryBoundary query={query} template="list">
      {({ groups }) => {
        const items = groups.filter((row) => row.parentId === parentId);
        return items.length ? (
          <ul className="space-y-2">
            {items.map((row, index) => {
              const image = displayImage(row.image);
              return (
                <li
                  key={row.id}
                  data-group-id={row.id}
                  className="rounded-xl bg-card"
                  onDragOver={(event) => {
                    if (dragging.current) event.preventDefault();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (dragging.current) move(items, dragging.current, row.id);
                  }}
                >
                  <ListItem
                    title={row.name}
                    subtitle={row.onStorefront ? "На витрине" : category ? "Скрыта на витрине" : "Скрыт на витрине"}
                    icon={
                      category ? (
                        <GroupThumb name={row.name} image={image ?? undefined} />
                      ) : (
                        <Avatar name={row.name} src={image?.src} />
                      )
                    }
                    onClick={() =>
                      nav.open(`/seller/${kind}/${encodeURIComponent(row.id)}`, { parent: parentId ?? undefined })
                    }
                  />
                  {category && canWrite && (
                    <div className="flex justify-end border-t border-border">
                      <IconButton
                        aria-label={`${row.name}: выше`}
                        disabled={command.isPending || index === 0}
                        onClick={() => move(items, row.id, items[index - 1].id)}
                      >
                        <ArrowUp size={16} />
                      </IconButton>
                      <IconButton
                        aria-label={`${row.name}: ниже`}
                        disabled={command.isPending || index + 1 === items.length}
                        onClick={() => move(items, row.id, items[index + 1].id)}
                      >
                        <ArrowDown size={16} />
                      </IconButton>
                      <button
                        type="button"
                        aria-label={`Перетащить: ${row.name}`}
                        draggable
                        disabled={command.isPending}
                        className="grid min-h-11 min-w-11 touch-none cursor-grab place-items-center"
                        onDragStart={(event) => {
                          dragging.current = row.id;
                          event.dataTransfer.setData("text/plain", row.id);
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
                            ?.closest<HTMLElement>("[data-group-id]");
                          if (target?.dataset.groupId) move(items, row.id, target.dataset.groupId);
                        }}
                      >
                        <GripVertical size={16} />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState title={category ? "Категорий пока нет" : "Брендов пока нет"} />
        );
      }}
    </QueryBoundary>,
    canWrite && (
      <Button
        full
        icon={<Plus size={18} />}
        onClick={() => nav.open(`/seller/${kind}/new`, { parent: parentId ?? undefined })}
      >
        {category ? "Добавить категорию" : "Добавить бренд"}
      </Button>
    ),
  );
}

function GroupThumb({ name, image }: { name: string; image?: ProductImageValue }) {
  const [failed, setFailed] = useState<string>();
  const source = imageSource(image);
  return (
    <span className="flex size-14 min-w-0 overflow-hidden rounded-lg bg-input">
      {source.src && source.src !== failed ? (
        <CategoryPhoto source={source} onError={() => setFailed(source.src)} />
      ) : (
        <Avatar name={name} />
      )}
    </span>
  );
}
