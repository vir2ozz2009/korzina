import { useEffect, useRef, useState } from "react";
import { analyzePhoto, type PhotoAnalysis } from "../../shared/photo-analysis";
import { CategoryTile } from "../../ui/CategoryTile";
import { PhotoPicker } from "../../ui/PhotoPicker";
import { ProductImage } from "../../ui/ProductImage";
import type { PhotoPickerItem } from "../../ui/photo-picker";

type PreviewMedia = PhotoPickerItem & Partial<PhotoAnalysis>;
export function PhotoAnalysisKit() {
  const [media, setMedia] = useState<PreviewMedia[]>([]);
  const resource = useRef<string | undefined>(undefined);
  useEffect(
    () => () => {
      if (resource.current) URL.revokeObjectURL(resource.current);
    },
    [],
  );
  const remove = () => {
    if (resource.current) URL.revokeObjectURL(resource.current);
    resource.current = undefined;
    setMedia([]);
  };
  const add = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    remove();
    const id = crypto.randomUUID();
    const src = URL.createObjectURL(file);
    resource.current = src;
    setMedia([{ id, name: file.name, kind: "image", src, status: "uploading" }]);
    try {
      const analysis = await analyzePhoto(file);
      setMedia((items) => items.map((item) => (item.id === id ? { ...item, ...analysis, status: "ready" } : item)));
    } catch {
      setMedia((items) =>
        items.map((item) =>
          item.id === id ? { ...item, status: "error", retryable: false, error: "Не удалось прочитать фото" } : item,
        ),
      );
    }
  };
  const item = media[0];
  return (
    <details className="space-y-3">
      <summary className="min-h-11 cursor-pointer text-label">Проверить своё фото</summary>
      <PhotoPicker
        items={media}
        onAdd={add}
        onRemove={remove}
        onRetry={() => {}}
        multiple={false}
        label="Фото для проверки рамки"
      />
      {item?.status === "ready" && (
        <>
          <ProductImage src={item.src} edgeColor={item.edgeColor} alt={item.name} fit="contain" className="w-full" />
          <output aria-label="edgeColor" className="text-small">
            edgeColor: {item.edgeColor}
          </output>
          <output aria-label="contentBox" className="block text-small">
            contentBox: {item.contentBox ? JSON.stringify(item.contentBox) : "нет — фото целиком"}
          </output>
          <div className="h-36 w-36">
            <CategoryTile
              name="Ваше фото"
              href="#preview"
              image={{
                src: item.src ?? "",
                edgeColor: item.edgeColor,
                contentBox: item.contentBox,
                width: item.width,
                height: item.height,
              }}
            />
          </div>
        </>
      )}
    </details>
  );
}
