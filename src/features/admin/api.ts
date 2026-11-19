import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../shared/api";
import type { ShopDraftInput } from "../../shared/contracts/admin";
import { checkResponse } from "../../shared/http-error";
import { commandHeaders, shopApi } from "../../shared/shop-api";

const adminApi = api.api.platform.admin;
const registryKey = ["admin", "shops"] as const;
const detailKey = (id: string) => [...registryKey, id] as const;

export function useRegistry() {
  return useQuery({
    queryKey: registryKey,
    retry: false,
    queryFn: async ({ signal }) => {
      const response = await adminApi.shops.$get({}, { init: { signal } });
      await checkResponse(response);
      return response.json();
    },
  });
}
export function useAdminShop(id: string) {
  return useQuery({
    queryKey: detailKey(id),
    retry: false,
    queryFn: async ({ signal }) => {
      const response = await adminApi.shops[":id"].$get({ param: { id } }, { init: { signal } });
      await checkResponse(response);
      return response.json();
    },
  });
}
export function useSlugAvailability(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: ["admin", "slug", slug],
    enabled,
    retry: false,
    queryFn: async ({ signal }) => {
      const response = await adminApi.shops["slug-availability"].$get({ query: { slug } }, { init: { signal } });
      await checkResponse(response);
      return response.json();
    },
  });
}
export function useCreateDraft() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ input, key }: { input: ShopDraftInput; key: string }) => {
      const response = await adminApi.shops.$post({ json: input }, { headers: commandHeaders(key) });
      await checkResponse(response);
      return response.json();
    },
    onSuccess: () => client.invalidateQueries({ queryKey: registryKey }),
  });
}
export function useOpenAdmin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const response = await shopApi.api.profile.admin.$post({ json: {} }, { headers: commandHeaders() });
      await checkResponse(response);
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["admin"] }),
  });
}
