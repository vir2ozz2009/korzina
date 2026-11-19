import { useState } from "react";
import type { CropPosition } from "../../../shared/contracts/media";
import { Button } from "../../../ui/Button";
import { ProductImage } from "../../../ui/ProductImage";
import { changeMediaState, mediaLink, type UploadedMedia } from "../api";
import { PhotoCropEditor } from "./PhotoCropEditor";

export function MediaUploadItem({
  file,
  name,
  src,
  seller,
  onSaved,
  onError,
}: {
  file: UploadedMedia;
  name: string;
  src?: string;
  seller: boolean;
  onSaved: () => void;
  onError: (error: unknown) => void;
}) {
  const [cropPosition, setCropPosition] = useState<CropPosition>(file.image?.cropPosition ?? { x: 0.5, y: 0.5 });
  const [saving, setSaving] = useState(false);
  const cropPhoto = seller && file.purpose === "product" && file.image;
  async function save() {
    setSaving(true);
    onError(undefined);
    try {
      await changeMediaState(file.id, seller, "attach", undefined, cropPhoto ? cropPosition : undefined);
      onSaved();
    } catch (error) {
      onError(error);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="space-y-3">
      <p role="status" className="text-small">
        {name} · загружено {(file.bytes / 1024).toLocaleString("ru", { maximumFractionDigits: 0 })} КБ
      </p>
      {cropPhoto ? (
        <PhotoCropEditor
          src={src ?? cropPhoto.src}
          name={name}
          position={cropPosition}
          onChange={setCropPosition}
          disabled={saving}
        />
      ) : (
        file.image && <ProductImage {...file.image} alt={name} shape="tile" fit="contain" className="w-full" />
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant={cropPhoto ? "primary" : "secondary"} loading={saving} onClick={() => void save()}>
          {cropPhoto ? "Сохранить кадр" : "Сохранить файл"}
        </Button>
        {!file.image && (
          <Button
            variant="secondary"
            onClick={() =>
              void mediaLink(file.id, seller)
                .then(({ url }) => window.open(url, "_blank", "noopener"))
                .catch(onError)
            }
          >
            Открыть файл
          </Button>
        )}
      </div>
    </div>
  );
}
