import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Cart } from "../../shared/contracts/cart";
import type { ReceiveCommand } from "../../shared/contracts/receiving";
import type { ReceivingMethod, TimeCommand } from "../../shared/contracts/receiving-time";
import { checkResponse, HttpError } from "../../shared/http-error";
import { shopApi, shopKey } from "../../shared/shop-api";
import { ensureShopSession } from "../../shared/shop-session";

const receivingKey = ["shop", shopKey, "receiving"] as const;
const cartKey = ["shop", shopKey, "cart"] as const;

export function useReceiving(enabled = true) {
  return useQuery({
    queryKey: receivingKey,
    enabled,
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      const result = await shopApi.api.receiving.$get({}, { init: { signal } });
      await checkResponse(result);
      return result.json();
    },
  });
}

function useReceivingMutation<T, Result>(mutationFn: (input: T) => Promise<Result>) {
  const client = useQueryClient();
  return useMutation({
    scope: { id: JSON.stringify(cartKey) },
    mutationFn,
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: receivingKey }),
        client.invalidateQueries({ queryKey: cartKey }),
      ]);
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
    onSuccess: async (selection) => {
      await Promise.all([
        client.cancelQueries({ queryKey: receivingKey, exact: true }),
        client.cancelQueries({ queryKey: cartKey, exact: true }),
      ]);
      client.setQueryData<ReceivingState>(receivingKey, (current) =>
        current && current.revision <= selection.revision ? { ...current, ...selection } : current,
      );
      client.setQueryData<Cart>(cartKey, (current) =>
        current && current.revision < selection.revision ? { ...current, revision: selection.revision } : current,
      );
    },
    onError: (error) => {
      if (error instanceof HttpError && error.code === "VERSION_CONFLICT") {
        void client.invalidateQueries({ queryKey: receivingKey, exact: true });
        void client.invalidateQueries({ queryKey: cartKey, exact: true });
      }
    },
  });
}

export function useAvailability(method: ReceivingMethod | undefined) {
  return useQuery({
    queryKey: [...receivingKey, "availability", method],
    enabled: !!method,
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      const response = await shopApi.api.receiving.availability.$get(
        { query: { method: method ?? "pickup" } },
        { init: { signal } },
      );
      await checkResponse(response);
      return response.json();
    },
  });
}

export function useSaveTime() {
  return useReceivingMutation(async (input: TimeCommand) => {
    await ensureShopSession();
    const response = await shopApi.api.receiving.time.$post({ json: input });
    await checkResponse(response);
    return response.json();
  });
}

export type ReceivingState = NonNullable<ReturnType<typeof useReceiving>["data"]>;
