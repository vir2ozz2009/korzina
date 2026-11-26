import { createContext, type ReactNode, useContext } from "react";
import { useToast } from "../../app/shell/ToastProvider";
import type { CartLine } from "../../shared/contracts/cart";
import { useCartData } from "./api";

type CartState = ReturnType<typeof useCartData> & {
  change: (line: CartLine, quantity: number, currency: string, undoRemoval?: boolean) => void;
};
const CartContext = createContext<CartState | null>(null);
export function CartProvider({ children, enabled = true }: { children: ReactNode; enabled?: boolean }) {
  const toast = useToast();
  const { query, mutation, pendingProducts } = useCartData(toast, enabled);
  function change(line: CartLine, quantity: number, currency: string, undoRemoval = false) {
    if (pendingProducts.has(line.productId) || !query.data) return;
    mutation.mutate({ line, quantity, currency, undoRemoval, key: crypto.randomUUID() });
  }
  return <CartContext value={{ query, mutation, pendingProducts, change }}>{children}</CartContext>;
}
export function useCart() {
  const cart = useContext(CartContext);
  if (!cart) throw new Error("CartProvider is required");
  return cart;
}
