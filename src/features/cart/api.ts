import { queryOptions, useMutation, useMutationState, useQuery, useQueryClient } from "@tanstack/react-query";
import { bootstrap } from "../../app/bootstrap";
import { queryPolicy } from "../../app/query-defaults";
import { checkResponse } from "../../shared/http-error";
import { commandHeaders, shopApi, shopKey } from "../../shared/shop-api";

import { type CartCommand, cartMutationOptions, optimisticCart } from "./commands";

const cartKey = ["shop", shopKey, "cart"] as const;
let guestSession: Promise<void> | undefined;
function ensureGuest() {
  guestSession ??= (async () => {
    const response = await shopApi.api.auth.guest.$post({ json: {} }, { headers: commandHeaders() });
    await checkResponse(response);
  })().catch((error) => {
    guestSession = undefined;
    throw error;
  });
  return guestSession;
}
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
        await ensureGuest();
        const response = await shopApi.api.cart.$post(
          {
            json: {
              variantId: input.line.variantId,
              quantity: input.quantity,
              expectedRevision: input.expectedRevision,
            },
          },
          { headers: commandHeaders(input.key) },
        );
        await checkResponse(response);
        return response.json();
      },
      notify,
    ),
  );
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
