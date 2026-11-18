import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useRef } from "react";
import { bootstrap } from "../../app/bootstrap";
import { type api, apiForShop } from "../../shared/api";
import type { MediaPurpose, PhotoMetadata } from "../../shared/contracts/media";
import { checkResponse, HttpError } from "../../shared/http-error";
import { ensureShopSession } from "../../shared/shop-session";

export type UploadedMedia = InferResponseType<typeof api.api.media.upload.$post, 201>;
const shop = () => new URLSearchParams(location.search).get("shop") ?? bootstrap?.slug ?? "lavka";
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
function sendFile(url: URL, body: Blob, input: UploadInput, metadata: PhotoMetadata): Promise<UploadedMedia> {
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
    request.setRequestHeader("X-Photo-Metadata", JSON.stringify(metadata));
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
  const prepared = useRef(new WeakMap<File, Promise<{ body: Blob; metadata: PhotoMetadata }>>());
  return useMutation({
    mutationFn: async (input: UploadInput) => {
      if (!seller) await ensureShopSession();
      let cached = prepared.current.get(input.file);
      if (!cached) {
        cached = (async () => {
          const body = await (await import("./prepare")).prepareUpload(input.file);
          const metadata =
            body.type === "application/pdf"
              ? {}
              : await (await import("../../shared/photo-analysis")).analyzePhoto(body);
          return { body, metadata };
        })().catch((error: unknown) => {
          prepared.current.delete(input.file);
          throw error;
        });
        prepared.current.set(input.file, cached);
      }
      let result: Awaited<typeof cached>;
      try {
        result = await cached;
      } catch (error) {
        if (error instanceof DOMException && ["InvalidStateError", "EncodingError"].includes(error.name))
          throw new HttpError(400, "Не удалось открыть фото. Выберите другой файл", "VALIDATION");
        throw error;
      }
      const { body, metadata } = result;
      if (input.signal.aborted) throw new DOMException("Загрузка отменена", "AbortError");
      input.onPrepared(body);
      return sendFile(
        apiForShop(shop(), seller).api.media.upload.$url({
          query: { shop: shop(), ...(seller ? { as: "seller" } : {}), purpose: input.purpose },
        }),
        body,
        input,
        metadata,
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
