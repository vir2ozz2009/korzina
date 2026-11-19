import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../shared/api";
import { checkResponse } from "../../shared/http-error";
import { commandHeaders, shopApi } from "../../shared/shop-api";

const cabinetKey = ["seller", "cabinet"] as const;

export function useCabinet(store?: string) {
  return useQuery({
    queryKey: [...cabinetKey, store],
    queryFn: async ({ signal }) => {
      const response = await api.api.seller.cabinet.$get({ query: { store } }, { init: { signal } });
      await checkResponse(response);
      return response.json();
    },
    retry: false,
  });
}

export function useEnterCabinet() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { initData: string; store?: string } | undefined) => {
      const options = { headers: commandHeaders() };
      const response = input
        ? await api.api.seller.cabinet.telegram.$post({ json: input }, options)
        : await shopApi.api.profile.seller.$post({ json: {} }, options);
      await checkResponse(response);
    },
    onSuccess: () => client.invalidateQueries({ queryKey: cabinetKey }),
  });
}

export function useSellerLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const response = await api.api.platform.auth.logout.$post({ json: {} }, { headers: commandHeaders() });
      await checkResponse(response);
    },
    onSuccess: async () => {
      await client.cancelQueries({ queryKey: cabinetKey });
      client.removeQueries({ queryKey: cabinetKey });
    },
  });
}
