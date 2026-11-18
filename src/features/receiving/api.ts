import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GeocodeInput, ReceiveCommand } from "../../shared/contracts/receiving";
import { checkResponse } from "../../shared/http-error";
import { shopApi, shopKey } from "../../shared/shop-api";
import { ensureShopSession } from "../../shared/shop-session";

const receivingKey = ["shop", shopKey, "receiving"] as const;
const cartKey = ["shop", shopKey, "cart"] as const;

export function useReceiving() {
  return useQuery({
    queryKey: receivingKey,
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      const result = await shopApi.api.receiving.$get({}, { init: { signal } });
      await checkResponse(result);
      return result.json();
    },
  });
}

export function useSaveReceiving() {
  const client = useQueryClient();
  return useMutation({
    scope: { id: JSON.stringify(cartKey) },
    mutationFn: async (input: ReceiveCommand) => {
      await ensureShopSession();
      const response = await shopApi.api.receiving.$post({ json: input });
      await checkResponse(response);
      return response.json();
    },
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: receivingKey }),
        client.invalidateQueries({ queryKey: cartKey }),
      ]);
    },
  });
}

export function useGeocode() {
  return useMutation({
    mutationFn: async ({ input, signal }: { input: GeocodeInput; signal?: AbortSignal }) => {
      await ensureShopSession();
      const result = await shopApi.api.receiving.geocode.$post({ json: input }, { init: { signal } });
      await checkResponse(result);
      return result.json();
    },
  });
}

export type ReceivingState = NonNullable<ReturnType<typeof useReceiving>["data"]>;
