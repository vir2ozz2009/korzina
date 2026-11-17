import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { type api, apiForShop } from "../../shared/api";
import type { MediaPurpose } from "../../shared/contracts/media";
import { prepareUpload } from "./prepare";

export type UploadedMedia = InferResponseType<typeof api.api.media.upload.$post, 201>;
async function check(response: { ok: boolean; json: () => Promise<unknown> }) {
  if (!response.ok) {
    const result = (await response.json()) as { error?: { message?: string } };
    throw new Error(result.error?.message ?? "Не удалось загрузить файл");
  }
}
const shop = () => new URLSearchParams(location.search).get("shop") ?? "lavka";
export const usageQuery = () =>
  queryOptions({
    queryKey: ["media", shop(), "usage"],
    staleTime: 30_000,
    queryFn: async () => {
      const response = await apiForShop(shop(), true).api.media.usage.$get();
      await check(response);
      return response.json();
    },
  });
export function useUpload(seller: boolean) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, purpose, key }: { file: File; purpose: MediaPurpose; key: string }) => {
      if (!seller) {
        const session = await apiForShop(shop()).api.auth.guest.$post(
          { json: {} },
          { headers: { "Idempotency-Key": crypto.randomUUID() } },
        );
        await check(session);
      }
      const body = await prepareUpload(file);
      const url = apiForShop(shop(), seller).api.media.upload.$url({
        query: { shop: shop(), ...(seller ? { as: "seller" } : {}), purpose },
      });
      const response = await fetch(url, { method: "POST", body, headers: { "Idempotency-Key": key } });
      await check(response);
      return response.json() as Promise<UploadedMedia>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["media", shop(), "usage"] }),
  });
}
export async function mediaLink(id: string, seller: boolean) {
  const response = await apiForShop(shop(), seller).api.media[":id"].link.$get({ param: { id } });
  await check(response);
  return response.json();
}
export async function attachMedia(id: string, seller: boolean) {
  const response = await apiForShop(shop(), seller).api.media[":id"].state.$post(
    { param: { id }, json: { action: "attach" } },
    { headers: { "Idempotency-Key": crypto.randomUUID() } },
  );
  await check(response);
  return response.json();
}
