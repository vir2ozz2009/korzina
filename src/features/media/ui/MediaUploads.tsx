import { useState } from "react";
import { useToast } from "../../../app/shell/ToastProvider";
import type { MediaPurpose } from "../../../shared/contracts/media";
import { errorKind } from "../../../shared/http-error";
import { Card } from "../../../ui/Card";
import { ErrorState } from "../../../ui/ErrorState";
import { PhotoPicker } from "../../../ui/PhotoPicker";
import { useMediaUploads } from "../useMediaUploads";
import { MediaUploadItem } from "./MediaUploadItem";

export function MediaUploads({ seller, purpose }: { seller: boolean; purpose: MediaPurpose }) {
  const uploads = useMediaUploads(seller, purpose);
  const notify = useToast();
  const [error, setError] = useState<unknown>();
  const actionError = error || uploads.error;
  const denied = [uploads.error, error].find((error) => error && errorKind(error) === "access");
  if (denied) return <ErrorState error={denied} />;
  return (
    <Card>
      <PhotoPicker
        items={uploads.items}
        onAdd={uploads.add}
        onRemove={uploads.remove}
        onRetry={uploads.retry}
        onReorder={uploads.reorder}
      />
      <p className="text-small text-muted-foreground">Фото загружаются сразу после выбора. До 10 МБ после сжатия.</p>
      {uploads.items
        .filter((item) => item.result && item.status === "ready")
        .map(
          ({ id, name, src, result }) =>
            result && (
              <MediaUploadItem
                key={id}
                file={result}
                name={name}
                src={src}
                seller={seller}
                onSaved={() => notify("Файл сохранён")}
                onError={setError}
              />
            ),
        )}
      {!!(error || uploads.error) && (
        <p role="alert" className="text-small text-status-danger-foreground">
          {actionError instanceof Error ? actionError.message : "Не удалось выполнить действие"}
        </p>
      )}
    </Card>
  );
}
