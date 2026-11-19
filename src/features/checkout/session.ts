import { checkoutInput } from "../../shared/contracts/checkout";
import { shopKey } from "../../shared/shop-api";
import type { Attempt } from "./api";

const key = (name: string) => `korzina:${shopKey}:checkout:v1:${name}`;

export function readAttempt(): Attempt | undefined {
  try {
    const raw = localStorage.getItem(key("attempt"));
    if (!raw) return undefined;
    const entry: Attempt = JSON.parse(raw);
    const age = Date.now() - entry.startedAt;
    if (
      age >= 0 &&
      age < 24 * 60 * 60_000 &&
      typeof entry.key === "string" &&
      checkoutInput.safeParse(entry.request).success
    )
      return entry;
    localStorage.removeItem(key("attempt"));
  } catch {
    // The attempt remains in memory if storage is unavailable.
  }
  return undefined;
}

export function storeAttempt(attempt?: Attempt) {
  try {
    if (attempt) localStorage.setItem(key("attempt"), JSON.stringify(attempt));
    else localStorage.removeItem(key("attempt"));
  } catch {
    // In-memory retry remains possible in this view.
  }
}

export function readOrderNumber() {
  try {
    const number = Number(localStorage.getItem(key("order")));
    return Number.isSafeInteger(number) && number > 0 ? number : undefined;
  } catch {
    return undefined;
  }
}

export function storeOrderNumber(number: number) {
  try {
    localStorage.setItem(key("order"), String(number));
  } catch {
    // The current navigation also passes the order number.
  }
}

export function clearPurchaseSession() {
  storeAttempt();
  try {
    localStorage.removeItem(key("order"));
  } catch {
    // Browser storage is optional.
  }
}
