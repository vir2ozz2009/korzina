import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ActiveOrders, RepeatPreview } from "../../shared/contracts/buyer-order";
import { checkResponse, errorKind } from "../../shared/http-error";
import { commandHeaders, shopApi, shopKey } from "../../shared/shop-api";

export const orderKeys = ["shop", shopKey, "buyer-orders"] as const;
const marker = `korzina:${shopKey}:buyer`;
export function rememberBuyer(known: boolean) {
  try {
    if (known) localStorage.setItem(marker, "1");
    else localStorage.removeItem(marker);
  } catch {
    // The current session is still available in memory.
  }
}
export function hasBuyerMarker() {
  try {
    return localStorage.getItem(marker) === "1";
  } catch {
    return false;
  }
}

export function useActiveOrders(enabled: boolean) {
  const client = useQueryClient();
  const queryKey = [...orderKeys, "active"] as const;
  return useQuery({
    queryKey,
    enabled,
    staleTime: 30_000,
    retry: false,
    queryFn: async ({ signal }) => {
      const previous = client.getQueryData<Extract<ActiveOrders, { data: unknown }>>(queryKey);
      const response = await shopApi.api.orders.active.$get(
        {},
        {
          init: { signal },
          headers: previous ? { "If-None-Match": `"${previous.rev}"` } : {},
        },
      );
      if (response.status === 304 && previous) return previous;
      await checkResponse(response);
      return (await response.json()) as Extract<ActiveOrders, { data: unknown }>;
    },
  });
}
const orderKey = (number: number) => [...orderKeys, "detail", number] as const;
const param = (number: number) => ({ number: String(number) });
const endpoint = shopApi.api.orders[":number"];

export function useBuyerOrder(number: number) {
  return useQuery({
    queryKey: orderKey(number),
    enabled: Number.isSafeInteger(number) && number > 0,
    staleTime: 30_000,
    retry: false,
    queryFn: async ({ signal }) => {
      const response = await endpoint.$get({ param: param(number) }, { init: { signal } });
      await checkResponse(response);
      return response.json();
    },
  });
}
export function useBuyerOrders(tab: "active" | "completed") {
  return useInfiniteQuery({
    queryKey: [...orderKeys, "list", tab],
    initialPageParam: undefined as string | undefined,
    retry: false,
    staleTime: 30_000,
    queryFn: async ({ pageParam, signal }) => {
      const response = await shopApi.api.orders.$get({ query: { tab, cursor: pageParam } }, { init: { signal } });
      await checkResponse(response);
      return response.json();
    },
    getNextPageParam: (page) => page.cursor,
  });
}
export function useRepeatPreview(number: number, enabled: boolean) {
  return useQuery({
    queryKey: [...orderKeys, "repeat", number],
    enabled,
    staleTime: 0,
    retry: false,
    queryFn: async ({ signal }) => {
      const response = await endpoint.repeat.$get({ param: param(number) }, { init: { signal } });
      await checkResponse(response);
      return response.json();
    },
  });
}
export function useOrderChange(number: number) {
  const client = useQueryClient();
  return useMutation({
    retry: (count, error) => count < 1 && errorKind(error) === "retry",
    mutationFn: async (input: { key: string; expectedVersion: number; proofMediaId?: string }) => {
      const options = { headers: commandHeaders(input.key) };
      const response = input.proofMediaId
        ? await endpoint.proof.$post(
            {
              param: param(number),
              json: { expectedVersion: input.expectedVersion, proofMediaId: input.proofMediaId },
            },
            options,
          )
        : await endpoint.cancel.$post(
            { param: param(number), json: { expectedVersion: input.expectedVersion } },
            options,
          );
      await checkResponse(response);
      return response.json();
    },
    onSuccess: (value) => {
      client.setQueryData(orderKey(number), value);
      void client.invalidateQueries({ queryKey: [...orderKeys, "active"] });
      void client.invalidateQueries({ queryKey: [...orderKeys, "list"] });
    },
  });
}
export function useRepeatOrder(number: number) {
  const client = useQueryClient();
  return useMutation({
    retry: (count, error) => count < 1 && errorKind(error) === "retry",
    mutationFn: async ({
      check,
      expectedCartRevision,
      key,
    }: Pick<RepeatPreview, "check" | "expectedCartRevision"> & { key: string }) => {
      const response = await endpoint.repeat.$post(
        { param: param(number), json: { check, expectedCartRevision } },
        { headers: commandHeaders(key) },
      );
      await checkResponse(response);
      return response.json();
    },
    onSuccess: ({ cart }) => client.setQueryData(["shop", shopKey, "cart"], cart),
  });
}
