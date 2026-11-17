import { Camera } from "lucide-react";
import { useId, useRef } from "react";
import { PhotoPickerTile } from "./PhotoPickerTile";
import { movePhoto, type PhotoPickerItem } from "./photo-picker";

export function PhotoPickerContent({
  items,
  onAdd,
  onRemove,
  onRetry,
  onReorder,
  multiple = true,
  disabled = false,
  label = "Фото и файлы",
}: {
  items: readonly PhotoPickerItem[];
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onReorder?: (ids: string[]) => void;
  multiple?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const move = (from: string, to: string) => onReorder?.(movePhoto(items, from, to).map((item) => item.id));
  return (
    <div className="space-y-2" data-photo-picker>
      <p id={id} className="text-label">
        {label}
      </p>
      <input
        ref={input}
        type="file"
        hidden
        multiple={multiple}
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.heic,.heif"
        disabled={disabled}
        aria-label={label}
        onChange={(event) => {
          onAdd(Array.from(event.currentTarget.files ?? []));
          event.currentTarget.value = "";
        }}
      />
      <ul aria-labelledby={id} className="flex gap-2 overflow-x-auto pb-2">
        {items.map((item, index) => (
          <li
            key={item.id}
            data-photo-id={item.id}
            draggable={!!onReorder && !disabled}
            onDragStart={(event) => event.dataTransfer.setData("text/plain", item.id)}
            onDragOver={(event) => {
              if (onReorder && !disabled) event.preventDefault();
            }}
            onDrop={(event) => {
              if (disabled) return;
              event.preventDefault();
              move(event.dataTransfer.getData("text/plain"), item.id);
            }}
          >
            <PhotoPickerTile
              item={item}
              disabled={disabled}
              onRemove={() => onRemove(item.id)}
              onRetry={() => onRetry(item.id)}
              onMove={onReorder ? (target) => move(item.id, target) : undefined}
              onStep={(direction) => {
                const target = items[index + direction];
                if (target) move(item.id, target.id);
              }}
            />
          </li>
        ))}
        {(multiple || !items.length) && (
          <li>
            <button
              type="button"
              disabled={disabled}
              onClick={() => input.current?.click()}
              className="flex size-24 shrink-0 flex-col items-center justify-center gap-1 rounded-md bg-input text-muted-foreground disabled:opacity-40"
            >
              <Camera className="size-6" />
              <span className="text-micro">Добавить фото</span>
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}
