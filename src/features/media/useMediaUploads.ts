import { useEffect, useRef, useState } from "react";
import type { MediaPurpose } from "../../shared/contracts/media";
import { errorKind } from "../../shared/http-error";
import type { PhotoPickerItem } from "../../ui/photo-picker";
import { changeMediaState, type UploadedMedia, useUpload } from "./api";

type Item = PhotoPickerItem & { result?: UploadedMedia };
type Pending = {
  file: File;
  purpose: MediaPurpose;
  key: string;
  preview?: string;
  controller?: AbortController;
  result?: UploadedMedia;
  deleteKey?: string;
};
export function useMediaUploads(
  seller: boolean,
  purpose: MediaPurpose,
  context?: { store: string; headers: Record<string, string> },
) {
  const upload = useUpload(seller, context);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<unknown>();
  const pending = useRef(new Map<string, Pending>());
  useEffect(
    () => () => {
      for (const entry of pending.current.values()) {
        entry.controller?.abort();
        if (entry.preview) URL.revokeObjectURL(entry.preview);
      }
      pending.current.clear();
    },
    [],
  );
  function update(id: string, values: Partial<Item>) {
    setItems((items) => items.map((item) => (item.id === id ? { ...item, ...values } : item)));
  }
  async function start(id: string) {
    const entry = pending.current.get(id);
    if (!entry) return;
    entry.controller?.abort();
    const controller = new AbortController();
    entry.controller = controller;
    update(id, { status: "uploading", progress: undefined, error: undefined });
    setError(undefined);
    try {
      const result = await upload.mutateAsync({
        file: entry.file,
        purpose: entry.purpose,
        key: entry.key,
        signal: controller.signal,
        onProgress: (progress) => {
          if (!controller.signal.aborted) update(id, { progress });
        },
        onPrepared: (blob) => {
          if (controller.signal.aborted || blob.type === "application/pdf") return;
          if (entry.preview) URL.revokeObjectURL(entry.preview);
          entry.preview = URL.createObjectURL(blob);
          update(id, { src: entry.preview });
        },
      });
      if (!controller.signal.aborted && pending.current.has(id)) {
        entry.result = result;
        update(id, { status: "ready", result });
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      setError(errorKind(error) === "access" ? error : undefined);
      update(id, {
        status: "error",
        error: error instanceof Error ? error.message : "Не удалось загрузить",
        retryable: errorKind(error) === "retry",
      });
    }
  }
  function add(files: File[]) {
    const added = files.map((file): Item => {
      const id = crypto.randomUUID();
      const kind = file.type === "application/pdf" || /\.pdf$/i.test(file.name) ? "pdf" : "image";
      const preview = kind === "image" ? URL.createObjectURL(file) : undefined;
      pending.current.set(id, { file, purpose, key: crypto.randomUUID(), preview });
      return { id, name: file.name, kind, src: preview, status: "uploading" };
    });
    setItems((items) => [...items, ...added]);
    for (const item of added) void start(item.id);
    return added.map((item) => item.id);
  }
  async function remove(id: string) {
    setError(undefined);
    const entry = pending.current.get(id);
    if (!entry) return;
    entry.controller?.abort();
    try {
      if (entry.result) {
        entry.deleteKey ??= crypto.randomUUID();
        await changeMediaState(entry.result.id, seller, "delete", entry.deleteKey, undefined, context);
      }
      if (entry.preview) URL.revokeObjectURL(entry.preview);
      pending.current.delete(id);
      setItems((items) => items.filter((item) => item.id !== id));
    } catch (error) {
      setError(error);
    }
  }
  function reorder(ids: string[]) {
    setItems((items) =>
      ids.flatMap((id) => {
        const item = items.find((item) => item.id === id);
        return item ? [item] : [];
      }),
    );
  }
  return {
    items,
    error,
    add,
    remove: (id: string) => {
      void remove(id);
    },
    retry: (id: string) => {
      void start(id);
    },
    reorder,
  };
}
