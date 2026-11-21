import { hc } from "hono/client";
import type { AppType } from "../../server/index";
import { buyerStorefrontHeaders } from "../app/cabinet-storefront";

// Type-only server import is erased from the browser bundle.
export const api = hc<AppType>("/");

export function apiForShop(shop: string, seller = false) {
  return hc<AppType>(`${location.origin}/`, {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), location.origin);
      url.searchParams.set("shop", shop);
      if (seller) url.searchParams.set("as", "seller");
      if (seller) return fetch(url, init);
      const headers = new Headers(init?.headers);
      for (const [name, value] of Object.entries(buyerStorefrontHeaders())) headers.set(name, value);
      return fetch(url, { ...init, headers });
    },
  });
}
