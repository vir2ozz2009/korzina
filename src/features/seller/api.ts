import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../shared/api";
import { checkResponse } from "../../shared/http-error";
import { commandHeaders, shopApi } from "../../shared/shop-api";

import { sellerOrderSearch } from "./order-search";

const cabinetKey = ["seller", "cabinet"] as const;
// Cross-site Telegram Web frames cannot use the ordinary browser session cookie.
let embeddedSession: string | undefined;
export const sellerSessionHeaders = (): Record<string, string> =>
  embeddedSession ? { Authorization: `Bearer ${embeddedSession}` } : {};

export function useCabinet(store?: string) {
  return useQuery({
    queryKey: [...cabinetKey, store],
    queryFn: async ({ signal }) => {
      const response = await api.api.seller.cabinet.$get(
        { query: { store } },
        { headers: sellerSessionHeaders(), init: { signal } },
      );
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
      if (!input) {
        await checkResponse(await shopApi.api.profile.seller.$post({ json: {} }, options));
        return;
      }
      const embedded = window.self !== window.top;
      const response = await api.api.seller.cabinet.telegram.$post(
        { json: { ...input, ...(embedded && { bearer: true }) } },
        options,
      );
      await checkResponse(response);
      if (embedded) {
        const { token } = await response.json();
        if (!token) throw new Error("Не удалось открыть сессию кабинета");
        embeddedSession = token;
      }
    },
    onSuccess: () => client.invalidateQueries({ queryKey: cabinetKey }),
  });
}

export function useSellerLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const response = await api.api.platform.auth.logout.$post(
        { json: {} },
        { headers: { ...commandHeaders(), ...sellerSessionHeaders() } },
      );
      await checkResponse(response);
    },
    onSuccess: async () => {
      embeddedSession = undefined;
      sellerOrderSearch.clear();
      await client.cancelQueries({ queryKey: cabinetKey });
      client.removeQueries({ queryKey: cabinetKey });
      await client.cancelQueries({ queryKey: ["seller-orders"] });
      client.removeQueries({ queryKey: ["seller-orders"] });
      await client.cancelQueries({ queryKey: ["seller-catalog"] });
      client.removeQueries({ queryKey: ["seller-catalog"] });
    },
  });
}
