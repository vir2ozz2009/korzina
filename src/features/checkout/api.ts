import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CheckoutCommand } from "../../shared/contracts/checkout";
import { checkResponse, errorKind } from "../../shared/http-error";
import { commandHeaders, shopApi, shopKey } from "../../shared/shop-api";

export function usePurchaseSummary(revision: number | undefined, cartUpdatedAt?: number) {
  return useQuery({
    // Promotion eligibility can change on a cart read without changing its command revision.
    queryKey: ["shop", shopKey, "purchase-summary", revision, cartUpdatedAt],
    // Cart refresh generations are only useful while the cart is mounted.
    ...(cartUpdatedAt !== undefined && { gcTime: 0 }),
    enabled: revision !== undefined,
    // Shop minimums and tariffs can change without a new cart revision.
    refetchOnMount: "always",
    queryFn: async ({ signal }) => {
      const response = await shopApi.api.checkout.summary.$get({}, { init: { signal } });
      await checkResponse(response);
      return response.json();
    },
  });
}

async function fetchQuote(signal?: AbortSignal) {
  const response = await shopApi.api.quote.$post({ json: {} }, { headers: commandHeaders(), init: { signal } });
  await checkResponse(response);
  return response.json();
}

const quoteKey = (
  revision: number | undefined,
  phone: string | null | undefined,
  telegramLinked: boolean | undefined,
) => ["shop", shopKey, "quote", revision, phone, telegramLinked] as const;

export function usePrepareQuote() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => fetchQuote(),
    onSuccess: (quote) => client.setQueryData(quoteKey(quote.revision, quote.phone, quote.telegramLinked), quote),
  });
}

export function useQuote(
  revision: number | undefined,
  contact: { phone: string | null; telegramLinked: boolean } | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: quoteKey(revision, contact?.phone, contact?.telegramLinked),
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
    retry: false,
    queryFn: ({ signal }) => fetchQuote(signal),
  });
}

export async function associateReceipt(quoteRevision: string, proofMediaId: string, signal: AbortSignal) {
  const response = await shopApi.api.checkout.receipt.$post(
    { json: { quoteRevision, proofMediaId } },
    { headers: commandHeaders(), init: { signal } },
  );
  await checkResponse(response);
}

export type Attempt = { key: string; request: CheckoutCommand; startedAt: number };

export function usePlaceOrder() {
  return useMutation({
    // A lost response can follow a commit. Retry the same command key to recover that order.
    retry: (count, error) => count === 0 && errorKind(error) === "retry",
    mutationFn: async (attempt: Attempt) => {
      const response = await shopApi.api.checkout.$post(
        { json: attempt.request },
        { headers: commandHeaders(attempt.key) },
      );
      await checkResponse(response);
      return response.json();
    },
  });
}

export function useOrder(number: number | undefined) {
  return useQuery({
    queryKey: ["shop", shopKey, "order", number],
    enabled: !!number,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
    queryFn: async ({ signal }) => {
      const response = await shopApi.api.checkout.orders[":number"].$get(
        { param: { number: String(number) } },
        { init: { signal } },
      );
      await checkResponse(response);
      return response.json();
    },
  });
}

export function useShopContacts(enabled: boolean) {
  return useQuery({
    queryKey: ["shop", shopKey, "contacts"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async ({ signal }) => {
      const response = await shopApi.api.checkout.support.$get({}, { init: { signal } });
      await checkResponse(response);
      return response.json();
    },
  });
}
