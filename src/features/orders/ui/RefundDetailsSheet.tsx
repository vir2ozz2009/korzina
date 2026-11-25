import { useRef, useState } from "react";
import type { BuyerOrder } from "../../../shared/contracts/buyer-order";
import { Button } from "../../../ui/Button";
import { Sheet } from "../../../ui/Sheet";
import { TextArea } from "../../../ui/TextArea";
import { useUpload } from "../../media";
import { useRefundDetails } from "../api";

export function RefundDetailsSheet({ order, close }: { order: BuyerOrder; close: () => void }) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File>();
  const [validation, setValidation] = useState<string>();
  const upload = useUpload(false);
  const command = useRefundDetails(order.number);
  const pending = upload.isPending || command.isPending;
  const media = useRef<{ file: File; key: string; id?: string } | undefined>(undefined);
  const attempt = useRef<{ body: string; key: string } | undefined>(undefined);
  async function submit() {
    const refund = order.refund;
    if (!refund || pending) return;
    if (!file && !text.trim()) {
      setValidation("Введите реквизиты или добавьте фото QR");
      return;
    }
    try {
      let mediaId: string | undefined;
      if (file) {
        const current = media.current?.file === file ? media.current : { file, key: crypto.randomUUID() };
        media.current = current;
        current.id ??= (
          await upload.mutateAsync({
            file,
            purpose: "refund",
            key: current.key,
            signal: new AbortController().signal,
            onProgress: () => {},
            onPrepared: () => {},
          })
        ).id;
        mediaId = current.id;
      }
      const payload = {
        expectedVersion: order.version,
        refundId: refund.id,
        mediaId,
        text: mediaId ? undefined : text.trim(),
      };
      const body = JSON.stringify(payload);
      const send = attempt.current?.body === body ? attempt.current : { body, key: crypto.randomUUID() };
      attempt.current = send;
      await command.mutateAsync({ ...payload, key: send.key });
      close();
    } catch {
      // Keep entered details and the exact same operation for a retry.
    }
  }
  return (
    <Sheet
      open
      title="Реквизиты для возврата"
      form
      onOpenChange={(open) => {
        if (!open && !pending) close();
      }}
    >
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <TextArea
          label="Реквизиты"
          maxLength={500}
          value={text}
          disabled={pending || !!file}
          onChange={(event) => {
            setText(event.target.value);
            setValidation(undefined);
          }}
          error={validation}
        />
        <label className="grid gap-2">
          Добавить фото QR
          <input
            type="file"
            accept="image/*,.heic,.heif"
            className="min-h-11 w-full"
            disabled={pending}
            onChange={(event) => {
              setFile(event.target.files?.[0]);
              setValidation(undefined);
              upload.reset();
            }}
          />
        </label>
        {file && (
          <Button variant="secondary" disabled={pending} onClick={() => setFile(undefined)}>
            Убрать фото
          </Button>
        )}
        {upload.error && <p role="alert">Не удалось прикрепить файл. {upload.error.message}</p>}
        {command.error && <p role="alert">{command.error.message}</p>}
        <Button full type="submit" loading={pending}>
          Отправить
        </Button>
      </form>
    </Sheet>
  );
}
