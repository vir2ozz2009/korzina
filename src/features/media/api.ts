import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useRef } from "react";
import { type api, apiForShop } from "../../shared/api";
import type { MediaPurpose } from "../../shared/contracts/media";
import { checkResponse, HttpError } from "../../shared/http-error";

export type UploadedMedia = InferResponseType<typeof api.api.media.upload.$post, 201>;
const shop = () => new URLSearchParams(location.search).get("shop") ?? "lavka";
export const usageQuery = () =>
  queryOptions({
    queryKey: ["media", shop(), "usage"],
    staleTime: 30_000,
    queryFn: async () => {
      const response = await apiForShop(shop(), true).api.media.usage.$get();
      await checkResponse(response);
      return response.json();
    },
  });
export interface UploadInput {
  file: File;
  purpose: MediaPurpose;
  key: string;
  signal: AbortSignal;
  onProgress: (progress: number) => void;
  onPrepared: (blob: Blob) => void;
}
function sendFile(url: URL, body: Blob, input: UploadInput): Promise<UploadedMedia> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const abort = () => {
      request.abort();
      reject(new DOMException("Загрузка отменена", "AbortError"));
    };
    if (input.signal.aborted) {
      abort();
      return;
    }
    const cleanup = () => input.signal.removeEventListener("abort", abort);
    request.open("POST", url);
    request.responseType = "json";
    request.setRequestHeader("Idempotency-Key", input.key);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) input.onProgress((95 * event.loaded) / event.total);
    };
    request.onload = () => {
      cleanup();
      const response: unknown = request.response;
      void checkResponse({
        ok: request.status >= 200 && request.status < 300,
        status: request.status,
        json: async () => response,
      }).then(() => {
        input.onProgress(100);
        resolve(response as UploadedMedia);
      }, reject);
    };
    request.onerror = () => {
      cleanup();
      reject(new TypeError("Проверьте соединение и попробуйте ещё раз"));
    };
    request.onabort = cleanup;
    input.signal.addEventListener("abort", abort, { once: true });
    request.send(body);
  });
}
export function useUpload(seller: boolean) {
  const qc = useQueryClient();
  const guest = useRef<Promise<void> | undefined>(undefined);
  return useMutation({
    mutationFn: async (input: UploadInput) => {
      if (!seller) {
        guest.current ??= (async () => {
          const session = await apiForShop(shop()).api.auth.guest.$post(
            { json: {} },
            { headers: { "Idempotency-Key": crypto.randomUUID() } },
          );
          await checkResponse(session);
        })().catch((error: unknown) => {
          guest.current = undefined;
          throw error;
        });
        await guest.current;
      }
      let body: Blob;
      try {
        body = await (await import("./prepare")).prepareUpload(input.file);
      } catch (error) {
        if (error instanceof DOMException && ["InvalidStateError", "EncodingError"].includes(error.name))
          throw new HttpError(400, "Не удалось открыть фото. Выберите другой файл", "VALIDATION");
        throw error;
      }
      if (input.signal.aborted) throw new DOMException("Загрузка отменена", "AbortError");
      input.onPrepared(body);
      return sendFile(
        apiForShop(shop(), seller).api.media.upload.$url({
          query: { shop: shop(), ...(seller ? { as: "seller" } : {}), purpose: input.purpose },
        }),
        body,
        input,
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["media", shop(), "usage"] }),
  });
}
export async function mediaLink(id: string, seller: boolean) {
  const response = await apiForShop(shop(), seller).api.media[":id"].link.$get({ param: { id } });
  await checkResponse(response);
  return response.json();
}
export async function changeMediaState(
  id: string,
  seller: boolean,
  action: "attach" | "delete",
  key: string = crypto.randomUUID(),
) {
  const response = await apiForShop(shop(), seller).api.media[":id"].state.$post(
    { param: { id }, json: { action } },
    { headers: { "Idempotency-Key": key } },
  );
  await checkResponse(response);
  return response.json();
}
