import type { Cart } from "../../shared/contracts/cart";
import { shopKey } from "../../shared/shop-api";

const key = `korzina/cart/v1/${shopKey}`;

export function cartSnapshot() {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as Cart) : undefined;
  } catch {
    return undefined;
  }
}

export function saveCartSnapshot(cart?: Cart) {
  try {
    if (cart?.lines.length) localStorage.setItem(key, JSON.stringify(cart));
    else localStorage.removeItem(key);
  } catch {
    // A blocked storage area does not prevent server cart access.
  }
}
