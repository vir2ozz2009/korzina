import { useEffect, useRef, useState } from "react";
import { paymentImageLimit } from "../../../../shared/contracts/seller-payments";
import { Button } from "../../../../ui/Button";
import { Input } from "../../../../ui/Input";
import { useUpload } from "../../../media";
import { sellerSessionHeaders } from "../../api";

export function SettingsImage({
  store,
  label,
  purpose,
  src,
  change,
}: {
  store: string;
  label: string;
  purpose: "logo" | "payment_qr";
  src?: string;
  change: (image: { id: string; src: string } | null) => void;
}) {
  const upload = useUpload(true, { store, headers: sellerSessionHeaders() });
  const controller = useRef<AbortController>(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const accept = purpose === "payment_qr" ? "image/jpeg,image/png,image/webp" : "image/*";
  useEffect(() => () => controller.current?.abort(), []);
  async function choose(file: File) {
    setError("");
    if (purpose === "payment_qr" && file.size > paymentImageLimit) {
      setError("Картинка для оплаты должна быть не больше 1 МБ.");
      return;
    }
    const request = new AbortController();
    controller.current?.abort();
    controller.current = request;
    setProgress(0);
    try {
      const result = await upload.mutateAsync({
        file,
        purpose,
        key: crypto.randomUUID(),
        signal: request.signal,
        onProgress: setProgress,
        onPrepared: () => {},
      });
      if (result.image && !request.signal.aborted) change({ id: result.id, src: result.image.src });
    } catch (error) {
      if (!request.signal.aborted) setError(error instanceof Error ? error.message : "Не удалось загрузить файл");
    }
  }
  return (
    <div className="space-y-2">
      {src && <img className="max-h-32 max-w-full rounded-lg object-contain" src={src} alt={label} />}
      <Input
        label={label}
        type="file"
        accept={accept}
        disabled={upload.isPending}
        error={error || undefined}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void choose(file);
        }}
      />
      {upload.isPending && <p role="status">Загружаем… {Math.round(progress)}%</p>}
      {src && (
        <Button variant="secondary" disabled={upload.isPending} onClick={() => change(null)}>
          Удалить
        </Button>
      )}
    </div>
  );
}
