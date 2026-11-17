import { useEffect, useRef, useState } from "react";
import { KitSection } from "../../ui/KitSection";
import { PhotoPicker } from "../../ui/PhotoPicker";
import type { PhotoPickerItem } from "../../ui/photo-picker";

export function PhotoPickerKit() {
  const [items, setItems] = useState<PhotoPickerItem[]>([
    { id: "photo", name: "Томаты", src: "/seed/tomato-photo-400.webp", kind: "image", status: "ready" },
    {
      id: "progress",
      name: "Загрузка",
      src: "/seed/tomato-photo-400.webp",
      kind: "image",
      status: "uploading",
      progress: 45,
    },
    { id: "error", name: "Ошибка", kind: "image", status: "error", error: "Ошибка сети" },
    { id: "pdf", name: "Чек.pdf", kind: "pdf", status: "ready" },
  ]);
  const urls = useRef(new Set<string>());
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(
    () => () => {
      for (const url of urls.current) URL.revokeObjectURL(url);
      for (const timer of timers.current) clearTimeout(timer);
    },
    [],
  );
  return (
    <KitSection title="PhotoPicker · фото и файлы">
      <PhotoPicker
        items={items}
        onAdd={(files) =>
          setItems((items) => [
            ...items,
            ...files.map((file): PhotoPickerItem => {
              const src = URL.createObjectURL(file);
              urls.current.add(src);
              return {
                id: crypto.randomUUID(),
                name: file.name,
                kind: file.type === "application/pdf" ? "pdf" : "image",
                src,
                status: "ready",
              };
            }),
          ])
        }
        onRemove={(id) => setItems((items) => items.filter((item) => item.id !== id))}
        onRetry={(id) => {
          setItems((items) =>
            items.map((item) => (item.id === id ? { ...item, status: "uploading", progress: undefined } : item)),
          );
          const timer = setTimeout(() => {
            timers.current.delete(timer);
            setItems((items) => items.map((item) => (item.id === id ? { ...item, status: "ready" } : item)));
          }, 600);
          timers.current.add(timer);
        }}
        onReorder={(ids) =>
          setItems((items) =>
            ids.flatMap((id) => {
              const item = items.find((item) => item.id === id);
              return item ? [item] : [];
            }),
          )
        }
      />
      <p className="text-small text-muted-foreground">
        Перетащите фото за ручку; с клавиатуры — стрелки на ручке. Это примеры состояний, без отправки файлов.
      </p>
    </KitSection>
  );
}
