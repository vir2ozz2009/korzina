import { createContext, type ReactNode, useContext } from "react";
import { useToast } from "../../app/shell/ToastProvider";
import type { CartLine } from "../../shared/contracts/cart";
import { useCartData } from "./api";

type CartState = ReturnType<typeof useCartData> & { change: (line: CartLine, quantity: number) => void };
const CartContext = createContext<CartState | null>(null);
export function CartProvider({ children }: { children: ReactNode }) {
  const { query, mutation } = useCartData();
  const toast = useToast();
  function change(line: CartLine, quantity: number) {
    if (mutation.isPending || !query.data) return;
    mutation.mutate(
      { line, quantity, key: crypto.randomUUID(), expectedRevision: query.data.revision },
      {
        onSuccess: (cart) => {
          if (quantity > (cart.lines.find((item) => item.variantId === line.variantId)?.quantity ?? 0))
            toast("Больше нет");
        },
        onError: (error) => toast(error.message),
      },
    );
  }
  return <CartContext value={{ query, mutation, change }}>{children}</CartContext>;
}
export function useCart() {
  const cart = useContext(CartContext);
  if (!cart) throw new Error("CartProvider is required");
  return cart;
}
