import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { bootstrap } from "../../app/bootstrap";
import { buyerStorefrontHeaders } from "../../app/cabinet-storefront";
import type { BuyerOrder } from "../../shared/contracts/buyer-order";
import type {
  CompositionAnswer,
  CompositionEdits,
  CompositionQuote,
  TimeChangeInput,
} from "../../shared/contracts/order-changes";
import type { AvailabilityDay, MethodSchedule } from "../../shared/contracts/receiving-time";
import type { PaymentOption } from "../../shared/contracts/seller-payments";
import { checkResponse, errorKind, HttpError } from "../../shared/http-error";
import { commandHeaders, shopKey } from "../../shared/shop-api";
import { sellerSessionHeaders } from "../seller";

export const buyerChangeOrdersKey = ["shop", shopKey, "buyer-orders"] as const;
const sellerChangeOrdersKey = (store: string) => ["seller-orders", store] as const;
export const buyerChatKey = ["shop", shopKey, "order-chat"] as const;
export const sellerChatKey = (store: string) => ["seller-chat", store] as const;

export async function orderRequest(path: string, store?: string, init: RequestInit = {}) {
  const url = new URL(`/api/${store ? "seller/" : ""}${path}`, location.origin);
  const shop = bootstrap?.slug ?? new URLSearchParams(location.search).get("shop");
  if (store) url.searchParams.set("store", store);
  else if (shop) url.searchParams.set("shop", shop);
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(store ? sellerSessionHeaders() : buyerStorefrontHeaders()))
    headers.set(key, value);
  const response = await fetch(url, { ...init, headers, cache: "no-store" });
  await checkResponse(response);
  return response;
}
export function orderPost(path: string, body: object, store?: string, key?: string) {
  return orderRequest(path, store, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...commandHeaders(key) },
  });
}

function useOrderCommand<T extends object, Result = unknown>(path: string, number: number, store?: string) {
  const client = useQueryClient();
  const attempt = useRef<{ fingerprint: string; key: string }>(undefined);
  const refresh = () =>
    client.invalidateQueries({ queryKey: store ? sellerChangeOrdersKey(store) : buyerChangeOrdersKey });
  return useMutation({
    retry: (count, error) => count === 0 && errorKind(error) === "retry",
    mutationFn: async (body: T): Promise<Result> => {
      const fingerprint = JSON.stringify(body);
      if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: crypto.randomUUID() };
      return (await orderPost(`orders/${number}/${path}`, body, store, attempt.current.key)).json();
    },
    onSuccess: (result) => {
      attempt.current = undefined;
      if (!store && result && typeof result === "object" && "number" in result)
        client.setQueryData([...buyerChangeOrdersKey, "detail", number], result);
      void refresh();
    },
    onError: (error) => {
      if ((error instanceof HttpError && error.status === 409) || errorKind(error) === "access") void refresh();
    },
  });
}

export function useCompositionQuote(store: string, number: number, edits: CompositionEdits) {
  return useQuery({
    queryKey: ["composition-quote", store, number, edits],
    enabled: edits.edits.length > 0,
    retry: false,
    queryFn: async (): Promise<CompositionQuote> =>
      (await orderPost(`orders/${number}/composition/quote`, edits, store)).json(),
  });
}

export const useProposeComposition = (store: string, number: number) =>
  useOrderCommand<CompositionEdits & { quote: string }>("composition", number, store);
export const useAnswerComposition = (number: number) =>
  useOrderCommand<CompositionAnswer, BuyerOrder>("composition", number);
export const useChangeTime = (number: number, store?: string) =>
  useOrderCommand<TimeChangeInput>("time", number, store);

export type ReplacementPick = {
  variantId: string;
  productId: string;
  name: string;
  unit: string;
  stock: number | null;
  priceMinor: number;
};
export function useReplacementPicks(store: string, number: number, query: string, enabled: boolean) {
  return useQuery({
    queryKey: ["composition-products", store, number, query],
    enabled,
    retry: false,
    queryFn: async ({ signal }): Promise<ReplacementPick[]> =>
      (
        await orderRequest(`orders/${number}/composition/pick?q=${encodeURIComponent(query)}`, store, { signal })
      ).json(),
  });
}

export function useOrderAvailability(number: number, enabled: boolean, store?: string) {
  return useQuery({
    queryKey: ["order-time", store ?? shopKey, number],
    enabled,
    retry: false,
    queryFn: async ({ signal }): Promise<{ timeZone: string; mode: MethodSchedule["mode"]; days: AvailabilityDay[] }> =>
      (await orderRequest(`orders/${number}/time`, store, { signal })).json(),
  });
}
export function useTopUpChoices(number: number, enabled: boolean) {
  return useQuery({
    queryKey: [...buyerChangeOrdersKey, "top-up", number],
    enabled,
    retry: false,
    queryFn: async ({ signal }): Promise<{ options: PaymentOption[]; amountMinor: number; selected?: string }> =>
      (await orderRequest(`orders/${number}/top-up`, undefined, { signal })).json(),
  });
}
export const useChooseTopUp = (number: number) =>
  useOrderCommand<{ expectedVersion: number; methodId: string }, BuyerOrder>("top-up", number);
