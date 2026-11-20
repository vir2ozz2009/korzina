import { useState } from "react";
import { bootstrap } from "../../../../app/bootstrap";
import type { CatalogImage } from "../../../../shared/contracts/catalog";
import type { CropPosition } from "../../../../shared/contracts/media";
import type { SellerPhotoInput } from "../../../../shared/contracts/seller-catalog";
import { Button } from "../../../../ui/Button";
import { PhotoPicker } from "../../../../ui/PhotoPicker";
import type { PhotoPickerItem } from "../../../../ui/photo-picker";
import { Sheet } from "../../../../ui/Sheet";
import { resolveDocumentImage } from "../../../catalog";
import { PhotoCropEditor, useMediaUploads } from "../../../media";
import { sellerSessionHeaders } from "../../api";

type Existing = { id: string; image: CatalogImage };
const center = { x: 0.5, y: 0.5 };
export const displayImage = (image: CatalogImage | null) => resolveDocumentImage(image, bootstrap?.mediaOrigin ?? "");

export function useCatalogPhotos(store: string, initial: Existing[], limit = 12) {
  const uploads = useMediaUploads(true, "product", { store, headers: sellerSessionHeaders() });
  const [order, setOrder] = useState(initial.map((photo) => photo.id));
  const [positions, setPositions] = useState<Record<string, CropPosition>>({});
  const [selected, setSelected] = useState<string>();
  const uploaded = new Map(uploads.items.map((item) => [item.id, item]));
  const source = new Map(initial.map((photo) => [photo.id, displayImage(photo.image)]));
  const items = order.flatMap((id, index): PhotoPickerItem[] => {
    const upload = uploaded.get(id);
    if (upload) return [upload];
    const image = source.get(id);
    return image
      ? [{ id, kind: "image", name: index === 0 ? "Обложка" : `Фото ${index + 1}`, src: image.src, status: "ready" }]
      : [];
  });
  const active = items.find((item) => item.id === selected);
  const values: SellerPhotoInput[] = order.flatMap((id) => {
    const storedId = uploaded.get(id)?.result?.id ?? (source.has(id) ? id : undefined);
    return storedId ? [{ id: storedId, ...(positions[id] && { cropPosition: positions[id] }) }] : [];
  });
  return {
    active,
    items,
    values,
    pending: items.some((item) => item.status !== "ready"),
    dirty: order.join("|") !== initial.map((item) => item.id).join("|") || !!Object.keys(positions).length,
    error: uploads.error,
    add: (files: File[]) => {
      const eligible = files
        .filter((file) => file.type !== "application/pdf")
        .slice(0, Math.max(0, limit - order.length));
      if (eligible.length) setOrder([...order, ...uploads.add(eligible)]);
    },
    remove: (id: string) => {
      if (uploaded.has(id)) uploads.remove(id);
      setOrder(order.filter((item) => item !== id));
    },
    reorder: setOrder,
    retry: uploads.retry,
    select: setSelected,
    selectedOriginal: active ? (source.get(active.id)?.original.src ?? active.src) : undefined,
    position: active ? (positions[active.id] ?? source.get(active.id)?.cropPosition ?? center) : center,
    crop: (position: CropPosition) => {
      if (active) setPositions({ ...positions, [active.id]: position });
    },
  };
}

export function CatalogPhotos({
  photos,
  disabled,
  label = "Фото товара",
  single,
}: {
  photos: ReturnType<typeof useCatalogPhotos>;
  disabled: boolean;
  label?: string;
  single?: boolean;
}) {
  return (
    <>
      <PhotoPicker
        items={photos.items}
        label={label}
        multiple={!single}
        disabled={disabled}
        onAdd={photos.add}
        onRemove={photos.remove}
        onReorder={single ? undefined : photos.reorder}
        onRetry={photos.retry}
      />
      {photos.items.some((item) => item.status === "ready") && (
        <div className="flex flex-wrap gap-1">
          {photos.items
            .filter((item) => item.status === "ready")
            .map((item, index) => (
              <Button key={item.id} variant="secondary" onClick={() => photos.select(item.id)}>
                {index ? `Фото ${index + 1}` : "Посмотреть фото"}
              </Button>
            ))}
        </div>
      )}
      {photos.active?.src && (
        <Sheet
          open
          title="Фото"
          onOpenChange={(open) => {
            if (!open) photos.select(undefined);
          }}
          form
        >
          <div className="space-y-2">
            <PhotoCropEditor
              src={photos.selectedOriginal ?? photos.active.src}
              name={photos.active.name}
              position={photos.position}
              disabled={disabled}
              onChange={photos.crop}
            />
            <a
              className="block text-label text-primary-text"
              href={photos.selectedOriginal}
              target="_blank"
              rel="noreferrer"
            >
              Открыть исходник
            </a>
            <Button full onClick={() => photos.select(undefined)}>
              Готово
            </Button>
          </div>
        </Sheet>
      )}
      {photos.error instanceof Error && <p role="alert">{photos.error.message}</p>}
    </>
  );
}
