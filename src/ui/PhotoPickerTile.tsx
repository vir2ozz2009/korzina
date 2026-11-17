import { Camera, FileText, GripVertical, LoaderCircle, X } from "lucide-react";
import { Img } from "./Img";
import type { PhotoPickerItem } from "./photo-picker";

export function PhotoPickerTile({
  item,
  disabled,
  onRemove,
  onRetry,
  onMove,
  onStep,
}: {
  item: PhotoPickerItem;
  disabled?: boolean;
  onRemove: () => void;
  onRetry: () => void;
  onMove?: (target: string) => void;
  onStep?: (direction: -1 | 1) => void;
}) {
  return (
    <fieldset className="relative size-24 min-w-0 shrink-0 overflow-hidden rounded-md bg-input" aria-label={item.name}>
      {item.kind === "pdf" ? (
        <div className="flex size-full flex-col items-center justify-center gap-1 px-2 text-muted-foreground">
          <FileText className="size-8" />
          <span className="w-full truncate text-micro">{item.name}</span>
        </div>
      ) : (
        <Img src={item.src} alt={item.name} fallback={<Camera className="size-6" />} className="size-full" />
      )}
      {item.status === "uploading" && (
        <div
          role="status"
          className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-card/70 text-small"
          aria-label={`Загрузка ${item.name}`}
        >
          <LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" />
          <span>{item.progress === undefined ? "Подготовка" : `${Math.round(item.progress)}%`}</span>
          <div
            role="progressbar"
            aria-label={`Загрузка ${item.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={item.progress}
            className="absolute inset-x-0 bottom-0 h-1 bg-border"
          >
            <span
              className={`block h-full bg-primary ${item.progress === undefined ? "w-full animate-pulse motion-reduce:animate-none" : ""}`}
              style={{ width: item.progress === undefined ? undefined : `${item.progress}%` }}
            />
          </div>
        </div>
      )}
      {item.status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-card/90 p-1 text-center">
          <span className="line-clamp-2 text-micro text-status-danger-foreground" title={item.error}>
            {item.error ?? "Не удалось загрузить"}
          </span>
          {item.retryable !== false && (
            <button
              type="button"
              className="min-h-11 text-small font-semibold text-primary-text"
              onClick={onRetry}
              disabled={disabled}
            >
              Повторить
            </button>
          )}
        </div>
      )}
      <button
        type="button"
        aria-label={`Удалить ${item.name}`}
        onClick={onRemove}
        disabled={disabled}
        className="absolute top-0 right-0 z-10 flex size-7 items-center justify-center rounded-pill bg-card/90 text-foreground disabled:opacity-40"
      >
        <X className="size-4" />
      </button>
      {onMove && item.status === "ready" && (
        <button
          type="button"
          aria-label={`Изменить порядок: ${item.name}`}
          disabled={disabled}
          className="absolute right-0 bottom-0 flex size-7 touch-none items-center justify-center rounded-sm bg-card/90"
          onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
          onPointerUp={(event) => {
            const target = document
              .elementFromPoint(event.clientX, event.clientY)
              ?.closest<HTMLElement>("[data-photo-id]");
            if (target?.dataset.photoId && event.currentTarget.closest("[data-photo-picker]")?.contains(target))
              onMove(target.dataset.photoId);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              onStep?.(event.key === "ArrowLeft" ? -1 : 1);
            }
          }}
        >
          <GripVertical className="size-4" />
        </button>
      )}
    </fieldset>
  );
}
