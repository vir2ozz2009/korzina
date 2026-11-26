import { queryOptions, useMutation, useMutationState, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { buyerStorefrontOpen } from "../../app/bootstrap";
import { queryPolicy } from "../../app/query-defaults";
import type { useToast } from "../../app/shell/ToastProvider";
import type { Cart, CartCommandInput } from "../../shared/contracts/cart";
import { checkResponse, errorKind, HttpError } from "../../shared/http-error";
import { commandHeaders, shopApi, shopKey } from "../../shared/shop-api";
import { ensureShopSession } from "../../shared/shop-session";

import { type CartCommand, cartMutationOptions, optimisticCart } from "./commands";

import { saveCartSnapshot } from "./snapshot";

const cartKey = ["shop", shopKey, "cart"] as const;
function cartQuery(enabled: boolean) {
  return queryOptions({
    queryKey: cartKey,
    ...queryPolicy.cart,
    enabled: enabled && buyerStorefrontOpen,
    queryFn: async ({ signal }) => {
      const response = await shopApi.api.cart.$get({}, { init: { signal } });
      await checkResponse(response);
      return (await import("../../shared/contracts/cart")).cartContract.parse(await response.json());
    },
  });
}

export function useCartData(notify: ReturnType<typeof useToast>, enabled: boolean) {
  const client = useQueryClient();
  const query = useQuery(cartQuery(enabled));
  const mutation = useMutation(
    cartMutationOptions(
      client,
      cartKey,
      async (input) => {
        await ensureShopSession();
        return sendCart(
          {
            variantId: input.line.variantId,
            quantity: input.quantity,
            expectedRevision: input.expectedRevision,
          },
          input.key,
        );
      },
      notify,
      onRemoved,
    ),
  );
  function onRemoved({ line, currency }: CartCommand): void {
    notify("Товар удалён", {
      label: "Вернуть",
      run: () => {
        if (client.getQueryData<Cart>(cartKey)?.lines.some((entry) => entry.variantId === line.variantId)) return;
        mutation.mutate({ line, currency, quantity: line.quantity, key: crypto.randomUUID() });
      },
    });
  }
  useEffect(() => {
    if (query.data) saveCartSnapshot(query.data);
  }, [query.data]);
  const pending = useMutationState({
    filters: { mutationKey: cartKey, status: "pending", exact: true },
    select: (item) => item.state.variables as CartCommand,
  });
  return {
    query: { ...query, data: query.data ? optimisticCart(query.data, pending) : undefined },
    mutation,
    pendingProducts: new Map(pending.map((input) => [input.line.productId, input.line.variantId])),
  };
}

async function sendCart(input: CartCommandInput, key: string): Promise<Cart> {
  const response = await shopApi.api.cart.$post({ json: input }, { headers: commandHeaders(key) });
  await checkResponse(response);
  return (await import("../../shared/contracts/cart")).cartContract.parse(await response.json());
}

export function useConfirmCart(notify: (message: string) => void) {
  const client = useQueryClient();
  return useMutation({
    scope: { id: JSON.stringify(cartKey) },
    retry: (count, error) => count < 1 && errorKind(error) === "retry",
    mutationFn: ({ revision, key }: { revision: number; key: string }) =>
      sendCart({ confirm: true, expectedRevision: revision }, key),
    onMutate: () => client.cancelQueries({ queryKey: cartKey }),
    onSuccess: (cart) =>
      client.setQueryData<Cart>(cartKey, (previous) =>
        previous && previous.revision > cart.revision ? previous : cart,
      ),
    onError: (error) => {
      const details = error instanceof HttpError ? error.details : undefined;
      if (details && typeof details === "object" && "cart" in details)
        client.setQueryData<Cart>(cartKey, details.cart as Cart);
      notify(error.message);
    },
  });
}

export type PromoCartInput = Extract<CartCommandInput, { promoAction: string }>;
export function usePromoCart() {
  const client = useQueryClient();
  return useMutation({
    scope: { id: JSON.stringify(cartKey) },
    retry: (count, error) => count < 1 && errorKind(error) === "retry",
    networkMode: "always",
    mutationFn: async ({ input, key }: { input: PromoCartInput; key: string }) => {
      await ensureShopSession();
      return sendCart(input, key);
    },
    onMutate: () => client.cancelQueries({ queryKey: cartKey }),
    onSuccess: (cart, { input }) => {
      if (input.promoAction === "compare") return;
      client.setQueryData<Cart>(cartKey, (previous) =>
        previous && previous.revision > cart.revision ? previous : cart,
      );
    },
    onError: (error) => {
      const details = error instanceof HttpError ? error.details : undefined;
      if (details && typeof details === "object" && "cart" in details)
        client.setQueryData<Cart>(cartKey, details.cart as Cart);
    },
  });
}

export function usePublicCartPromos(revision: number | undefined, confirmed: boolean) {
  return useQuery({
    queryKey: [...cartKey, "public-promotions", confirmed, revision],
    enabled: revision !== undefined,
    retry: false,
    refetchOnWindowFocus: "always",
    refetchInterval: ({ state }) => (state.data?.length ? 15_000 : false),
    queryFn: async ({ signal }) => {
      const response = await shopApi.api.cart.promotions.$get({}, { init: { signal } });
      await checkResponse(response);
      return response.json();
    },
  });
}
