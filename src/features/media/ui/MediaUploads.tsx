import { useState } from "react";
import { useToast } from "../../../app/shell/ToastProvider";
import type { MediaPurpose } from "../../../shared/contracts/media";
import { errorKind } from "../../../shared/http-error";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { ErrorState } from "../../../ui/ErrorState";
import { PhotoPicker } from "../../../ui/PhotoPicker";
import { ProductImage } from "../../../ui/ProductImage";
import { changeMediaState, mediaLink } from "../api";
import { useMediaUploads } from "../useMediaUploads";

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
          ({ id, name, result }) =>
            result && (
              <div key={id} className="space-y-2">
                <p role="status" className="text-small">
                  {name} · загружено {(result.bytes / 1024).toLocaleString("ru", { maximumFractionDigits: 0 })} КБ
                </p>
                {result.image && <ProductImage {...result.image} alt={name} shape="tile" className="w-full" />}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    onClick={() =>
                      void changeMediaState(result.id, seller, "attach")
                        .then(() => notify("Файл сохранён"))
                        .catch(setError)
                    }
                  >
                    Сохранить файл
                  </Button>
                  {!result.image && (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        void mediaLink(result.id, seller)
                          .then(({ url }) => window.open(url, "_blank", "noopener"))
                          .catch(setError)
                      }
                    >
                      Открыть файл
                    </Button>
                  )}
                </div>
              </div>
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
