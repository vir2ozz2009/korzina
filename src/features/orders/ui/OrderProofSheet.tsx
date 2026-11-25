import { useEffect, useRef, useState } from "react";
import type { BuyerOrder } from "../../../shared/contracts/buyer-order";
import { Button } from "../../../ui/Button";
import { Sheet } from "../../../ui/Sheet";
import { useUpload } from "../../media";
import { useOrderChange } from "../api";

export function OrderProofSheet({ order, close, saved }: { order: BuyerOrder; close: () => void; saved: () => void }) {
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState("");
  const upload = useUpload(false);
  const change = useOrderChange(order.number);
  const attempt = useRef<{ uploadKey: string; commandKey: string; proofMediaId?: string }>(undefined);
  const controller = useRef<AbortController | undefined>(undefined);
  useEffect(() => {
    if (!file?.type.startsWith("image/")) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => () => controller.current?.abort(), []);
  const pending = upload.isPending || change.isPending;
  async function submit() {
    if (!file || pending || !attempt.current || !order.canReplaceProof) return;
    const current = attempt.current;
    const task = new AbortController();
    controller.current = task;
    try {
      current.proofMediaId ??= (
        await upload.mutateAsync({
          file,
          purpose: "receipt",
          key: current.uploadKey,
          signal: task.signal,
          onProgress: () => {},
          onPrepared: () => {},
        })
      ).id;
      await change.mutateAsync({
        key: current.commandKey,
        expectedVersion: order.version,
        proofMediaId: current.proofMediaId,
        obligationId: order.topUp?.id,
      });
      saved();
    } catch {
      // The failed upload or command stays visible with its original retry key.
    }
  }
  return (
    <Sheet
      open
      title={order.topUp && !order.topUp.proof ? "Прикрепить чек" : "Заменить подтверждение оплаты"}
      onOpenChange={(open) => {
        if (!open && !pending) close();
      }}
    >
      <div className="space-y-3">
        <label className="grid gap-1">
          Чек
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.heic,.heif"
            disabled={pending}
            className="min-h-11 w-full"
            onChange={(event) => {
              setFile(event.target.files?.[0]);
              attempt.current = { uploadKey: crypto.randomUUID(), commandKey: crypto.randomUUID() };
              upload.reset();
              change.reset();
            }}
          />
        </label>
        {preview && <img className="max-h-48 w-full rounded-md object-contain" src={preview} alt="Превью чека" />}
        {file && <p className="break-all">{file.name}</p>}
        {upload.isError && <p role="alert">Не удалось загрузить чек. {upload.error.message}</p>}
        {change.isError && <p role="alert">Не удалось сохранить чек. {change.error.message}</p>}
        <Button full loading={pending} disabled={!file || !order.canReplaceProof} onClick={() => void submit()}>
          {upload.isError || change.isError ? "Повторить" : "Сохранить чек"}
        </Button>
        {pending && <p role="status">{upload.isPending ? "Загружаем чек…" : "Сохраняем чек…"}</p>}
        <Button full variant="secondary" disabled={pending} onClick={close}>
          Назад
        </Button>
      </div>
    </Sheet>
  );
}
