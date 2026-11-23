import { Camera, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { readChatDraft, writeChatDraft } from "../../../shared/chat-drafts";
import { errorKind } from "../../../shared/http-error";
import { Button } from "../../../ui/Button";
import { TextArea } from "../../../ui/TextArea";
import { useUpload } from "../../media";
import { sellerSessionHeaders } from "../../seller";
import { useSendChat } from "../api";

export function ChatComposer({ number, store, draftKey }: { number: number; store?: string; draftKey: string }) {
  const [draft, setDraft] = useState(() => readChatDraft(draftKey));
  const upload = useUpload(!!store, store ? { store, headers: sellerSessionHeaders() } : undefined);
  const send = useSendChat(number, store);
  const fileInput = useRef<HTMLInputElement>(null);
  const current = useRef<{ file: File; key: string; controller: AbortController }>(undefined);
  useEffect(() => () => current.current?.controller.abort(), []);
  const pending = send.isPending || upload.isPending;
  const length = Array.from(draft.text.trim()).length;
  const update = (next: typeof draft) => {
    setDraft(next);
    writeChatDraft(draftKey, next);
  };
  async function attach(attempt: NonNullable<typeof current.current>) {
    try {
      const media = await upload.mutateAsync({
        ...attempt,
        purpose: "chat",
        signal: attempt.controller.signal,
        onProgress: () => {},
        onPrepared: () => {},
      });
      update({ ...draft, mediaId: media.id, attempt: undefined });
    } catch {
      /* The upload key remains available for retry. */
    }
  }
  function submit() {
    const body = { text: draft.text.trim() || undefined, mediaId: draft.mediaId };
    const attempt = draft.attempt ?? { body, command: crypto.randomUUID() };
    update({ ...draft, attempt });
    send.mutate(attempt, {
      onSuccess: () => {
        setDraft({ text: "" });
        writeChatDraft(draftKey);
      },
      onError: (error) => {
        if (errorKind(error) !== "retry") update({ ...draft, attempt: undefined });
      },
    });
  }
  return (
    <div className="space-y-2">
      <TextArea
        label="Сообщение"
        placeholder="Напишите сообщение"
        disabled={pending}
        error={length > 1000 ? "Сообщение слишком длинное" : undefined}
        value={draft.text}
        onChange={(event) => {
          send.reset();
          update({ ...draft, text: event.target.value, attempt: undefined });
        }}
      />
      <input
        type="file"
        hidden
        ref={fileInput}
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.currentTarget.value = "";
          if (file) {
            current.current = { file, key: crypto.randomUUID(), controller: new AbortController() };
            void attach(current.current);
          }
        }}
      />
      {upload.error && <p role="alert">Не удалось загрузить фото. {upload.error.message}</p>}
      {send.error && (
        <p role="alert">{errorKind(send.error) === "retry" ? "Не удалось проверить отправку" : send.error.message}</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          icon={<Camera size={18} aria-hidden />}
          disabled={pending}
          onClick={() => fileInput.current?.click()}
        >
          {draft.mediaId ? "Заменить фото" : "Фото"}
        </Button>
        {draft.mediaId && (
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => update({ ...draft, mediaId: undefined, attempt: undefined })}
          >
            Убрать фото
          </Button>
        )}
        {upload.error && current.current && (
          <Button
            variant="ghost"
            onClick={() => {
              if (current.current) void attach(current.current);
            }}
          >
            Повторить загрузку
          </Button>
        )}
        <Button
          className="ml-auto"
          loading={send.isPending}
          icon={<Send size={18} aria-hidden />}
          disabled={upload.isPending || length > 1000 || (!length && !draft.mediaId)}
          onClick={submit}
        >
          {draft.attempt ? "Проверить отправку" : "Отправить"}
        </Button>
      </div>
      {upload.isPending && <p role="status">Загружаем фото…</p>}
    </div>
  );
}
