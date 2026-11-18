import { FileText } from "lucide-react";
import { useRef } from "react";
import { Button } from "../../../ui/Button";
import type { useReceipt } from "./useReceipt";

export function ReceiptField({
  receipt,
  quoteRevision,
  locked,
}: {
  receipt: ReturnType<typeof useReceipt>;
  quoteRevision: string;
  locked: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2">
      <input
        type="file"
        ref={input}
        hidden
        aria-label="Чек"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.heic,.heif"
        disabled={locked || receipt.pending}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void receipt.attach(quoteRevision, file);
        }}
      />
      {receipt.draft ? (
        <>
          <div className="flex items-center gap-2 rounded-lg bg-input p-2">
            {receipt.draft.preview ? (
              <img src={receipt.draft.preview} alt="Чек" className="size-12 rounded-md object-cover" />
            ) : (
              <FileText size={26} aria-hidden />
            )}
            <span className="min-w-0 break-all text-meta">{receipt.draft.name}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={locked || receipt.pending} onClick={() => input.current?.click()}>
              Заменить
            </Button>
            <Button variant="ghost" disabled={locked || receipt.pending} onClick={receipt.clear}>
              Удалить
            </Button>
          </div>
        </>
      ) : (
        <Button full variant="secondary" disabled={locked || receipt.pending} onClick={() => input.current?.click()}>
          Прикрепить чек
        </Button>
      )}
      {receipt.pending && <p role="status">Загружаем чек…</p>}
      {receipt.error && (
        <div role="alert" className="space-y-2">
          <p className="text-status-danger-foreground">Не удалось загрузить чек. {receipt.error}</p>
          <Button variant="secondary" disabled={locked} onClick={() => void receipt.attach(quoteRevision)}>
            Повторить
          </Button>
        </div>
      )}
    </div>
  );
}
