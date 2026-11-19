import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../shared/api";
import type { BotChange, ShopChange, ShopDraftInput } from "../../shared/contracts/admin";
import { checkResponse, errorKind, HttpError } from "../../shared/http-error";
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

export type AdminShop = NonNullable<ReturnType<typeof useAdminShop>["data"]>;

export function useShopChange(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ input, key }: { input: ShopChange; key: string }) => {
      const response = await adminApi.shops[":id"].$patch(
        { param: { id }, json: input },
        { headers: commandHeaders(key) },
      );
      await checkResponse(response);
      return response.json();
    },
    retry: (failures, error) => failures < 1 && errorKind(error) === "retry",
    onSuccess: () => client.invalidateQueries({ queryKey: registryKey }),
    onError: (error) => {
      if (error instanceof HttpError && error.code === "VERSION_CONFLICT")
        void client.invalidateQueries({ queryKey: detailKey(id) });
    },
  });
}

export function useBotChange(id: string) {
  const client = useQueryClient();
  return async (input: BotChange) => {
    const response = await adminApi.shops[":id"].bot.$post(
      { param: { id }, json: input },
      { headers: commandHeaders() },
    );
    try {
      await checkResponse(response);
    } catch (error) {
      if (error instanceof HttpError && error.code === "VERSION_CONFLICT")
        await client.invalidateQueries({ queryKey: detailKey(id) });
      throw error;
    }
    await client.invalidateQueries({ queryKey: registryKey });
  };
}
