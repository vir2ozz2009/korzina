import { mutationOptions, type QueryClient } from "@tanstack/react-query";
import { cartTotals } from "../../shared/cart-totals";
import type { Cart, CartLine } from "../../shared/contracts/cart";
import { errorKind, HttpError } from "../../shared/http-error";

export type CartCommand = {
  line: CartLine;
  quantity: number;
  currency: string;
  key: string;
  expectedRevision?: number;
};

export function optimisticCart(cart: Cart, pending: CartCommand[]): Cart {
  if (!pending.length) return cart;
  const lines = new Map(cart.lines.map((line) => [line.variantId, line]));
  for (const { line, quantity } of pending) {
    if (quantity) lines.set(line.variantId, { ...line, quantity });
    else lines.delete(line.variantId);
  }
  return {
    ...cart,
    currency: cart.currency ?? pending[0].currency,
    ...cartTotals([...lines.values()], cart.adjustments),
  };
}

export function cartMutationOptions(
  client: QueryClient,
  key: readonly string[],
  send: (input: CartCommand & { expectedRevision: number }) => Promise<Cart>,
  notify: (message: string) => void,
) {
  return mutationOptions({
    mutationKey: key,
    scope: { id: JSON.stringify(key) },
    retry: (count, error) => count < 1 && errorKind(error) === "retry",
    mutationFn: (input: CartCommand) => {
      // Assigned when this command starts, after preceding commands have committed.
      // A network retry keeps both this revision and its idempotency key.
      const expectedRevision = input.expectedRevision ?? client.getQueryData<Cart>(key)?.revision ?? 0;
      input.expectedRevision = expectedRevision;
      return send({ ...input, expectedRevision });
    },
    onMutate: () => client.cancelQueries({ queryKey: key }),
    onSuccess: (cart, input) => {
      client.setQueryData<Cart>(key, (previous) => (previous && previous.revision > cart.revision ? previous : cart));
      if (input.quantity > (cart.lines.find((line) => line.variantId === input.line.variantId)?.quantity ?? 0))
        notify("Больше нет");
    },
    onError: (error) => {
      const details = error instanceof HttpError ? error.details : undefined;
      if (details && typeof details === "object" && "cart" in details)
        client.setQueryData<Cart>(key, details.cart as Cart);
      notify(error.message);
    },
  });
}
