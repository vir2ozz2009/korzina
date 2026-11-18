import { queryOptions, useMutation, useMutationState, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { bootstrap } from "../../app/bootstrap";
import { queryPolicy } from "../../app/query-defaults";
import type { Cart, CartCommandInput } from "../../shared/contracts/cart";
import { checkResponse, errorKind, HttpError } from "../../shared/http-error";
import { commandHeaders, shopApi, shopKey } from "../../shared/shop-api";
import { ensureShopSession } from "../../shared/shop-session";

import { type CartCommand, cartMutationOptions, optimisticCart } from "./commands";

import { saveCartSnapshot } from "./snapshot";

const cartKey = ["shop", shopKey, "cart"] as const;
function cartQuery() {
  return queryOptions({
    queryKey: cartKey,
    ...queryPolicy.cart,
    enabled: bootstrap?.status === "active",
    queryFn: async ({ signal }) => {
      const response = await shopApi.api.cart.$get({}, { init: { signal } });
      await checkResponse(response);
      return response.json();
    },
  });
}

export function useCartData(notify: (message: string) => void) {
  const client = useQueryClient();
  const query = useQuery(cartQuery());
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
    ),
  );
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
  return response.json();
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
