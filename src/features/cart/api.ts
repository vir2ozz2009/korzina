import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { bootstrap } from "../../app/bootstrap";
import { queryPolicy } from "../../app/query-defaults";
import type { Cart, CartLine } from "../../shared/contracts/cart";
import { checkResponse, errorKind, HttpError } from "../../shared/http-error";
import { addMinor, multiplyMinor } from "../../shared/money";
import { commandHeaders, shopApi, shopKey } from "../../shared/shop-api";

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

export function useCartData() {
  const client = useQueryClient();
  const query = useQuery(cartQuery());
  const mutation = useMutation({
    mutationKey: cartKey,
    retry: (count, error) => count < 1 && errorKind(error) === "retry",
    mutationFn: async (input: { line: CartLine; quantity: number; key: string; expectedRevision: number }) => {
      await ensureGuest();
      const response = await shopApi.api.cart.$post(
        {
          json: { variantId: input.line.variantId, quantity: input.quantity, expectedRevision: input.expectedRevision },
        },
        { headers: commandHeaders(input.key) },
      );
      await checkResponse(response);
      return response.json();
    },
    onMutate: async ({ line, quantity }) => {
      await client.cancelQueries({ queryKey: cartKey });
      const previous = client.getQueryData<Cart>(cartKey);
      if (previous) {
        const lines = previous.lines.filter((item) => item.variantId !== line.variantId);
        if (quantity) lines.push({ ...line, quantity });
        client.setQueryData<Cart>(cartKey, {
          ...previous,
          lines,
          count: lines.reduce((sum, item) => sum + item.quantity, 0),
          totalMinor: addMinor(...lines.map((item) => multiplyMinor(item.priceMinor, item.quantity))),
        });
      }
      return { previous };
    },
    onSuccess: (cart) => client.setQueryData<Cart>(cartKey, cart),
    onError: (error, _input, context) => {
      const details = error instanceof HttpError ? error.details : undefined;
      const current = details && typeof details === "object" && "cart" in details ? (details.cart as Cart) : undefined;
      if (current ?? context?.previous) client.setQueryData<Cart>(cartKey, current ?? context?.previous);
    },
  });
  return { query, mutation };
}
