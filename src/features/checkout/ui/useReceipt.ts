import { useEffect, useRef, useState } from "react";
import { shopKey } from "../../../shared/shop-api";
import { changeMediaState, useUpload } from "../../media";
import { associateReceipt } from "../api";

type StoredReceipt = { proofId: string; name: string; expiresAt: number };
type Draft = { name: string; proofId?: string; preview?: string; bound: boolean; expiresAt: number };
type Upload = { file: File; key: string; proofId?: string };
const receiptKey = `korzina:${shopKey}:receipt:v1`;

function storeReceipt(draft?: Draft) {
  try {
    if (!draft?.bound || !draft.proofId) sessionStorage.removeItem(receiptKey);
    else {
      const { proofId, name, expiresAt } = draft;
      sessionStorage.setItem(receiptKey, JSON.stringify({ proofId, name, expiresAt } satisfies StoredReceipt));
    }
  } catch {
    // File upload remains usable in the current view.
  }
}

function readReceipt(): Draft | undefined {
  try {
    const raw = sessionStorage.getItem(receiptKey);
    if (!raw) return undefined;
    const data: StoredReceipt = JSON.parse(raw);
    if (typeof data.proofId === "string" && typeof data.name === "string" && data.expiresAt > Date.now())
      return { ...data, bound: true };
    storeReceipt();
  } catch {
    // An unavailable or corrupt record must not block a new upload.
  }
  return undefined;
}

export function useReceipt() {
  const upload = useUpload(false);
  const [draft, setDraft] = useState(readReceipt);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const task = useRef<AbortController>(null);
  const retry = useRef<Upload | undefined>(undefined);
  const preview = useRef<string | undefined>(undefined);
  useEffect(
    () => () => {
      task.current?.abort();
      if (preview.current) URL.revokeObjectURL(preview.current);
    },
    [],
  );

  function clear(deleteFile = true) {
    if (pending) return;
    if (preview.current) URL.revokeObjectURL(preview.current);
    preview.current = undefined;
    if (deleteFile && draft?.proofId) void changeMediaState(draft.proofId, false, "delete").catch(() => {});
    retry.current = undefined;
    setDraft(undefined);
    storeReceipt();
    setError("");
  }

  async function attach(quoteRevision: string, file?: File) {
    if (pending) return;
    const next = file ? { file, key: crypto.randomUUID() } : retry.current;
    if (!next) return;
    retry.current = next;
    setError("");
    setPending(true);
    const controller = new AbortController();
    task.current = controller;
    let prepared: Blob | undefined;
    try {
      const id =
        next.proofId ??
        (
          await upload.mutateAsync({
            file: next.file,
            purpose: "receipt",
            key: next.key,
            signal: controller.signal,
            onProgress: () => {},
            onPrepared: (blob) => {
              prepared = blob;
            },
          })
        ).id;
      retry.current = { ...next, proofId: id };
      await associateReceipt(quoteRevision, id, controller.signal);
      if (draft?.proofId && draft.proofId !== id) void changeMediaState(draft.proofId, false, "delete").catch(() => {});
      if (preview.current) URL.revokeObjectURL(preview.current);
      preview.current = prepared?.type.startsWith("image/") ? URL.createObjectURL(prepared) : undefined;
      const saved = {
        name: next.file.name,
        proofId: id,
        preview: preview.current,
        bound: true,
        expiresAt: Date.now() + 86_400_000,
      };
      setDraft(saved);
      storeReceipt(saved);
      retry.current = undefined;
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Попробуйте ещё раз");
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  }

  return { draft, attach, clear: () => clear(), complete: () => clear(false), error, pending };
}
