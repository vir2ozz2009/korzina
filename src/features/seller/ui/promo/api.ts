import type { Cart } from "../../../../shared/contracts/cart";
import type { PromoOffer, PromoPrice, PromoTerms } from "../../../../shared/contracts/promo";
import { checkResponse } from "../../../../shared/http-error";
import { commandHeaders } from "../../../../shared/shop-api";
import { sellerSessionHeaders } from "../../api";

export type PromoCatalog = {
  variants: { id: string; name: string; productId: string; productName: string }[];
  categories: { id: string; name: string }[];
};
export type PromoList = {
  offers: PromoOffer[];
  prices: PromoPrice[];
  currency: string;
  timeZone?: string;
  nextOffset: number | null;
};
export type Report = {
  orderCount: number;
  customers: number;
  guestOrders: number;
  deliveryMinor: number;
  thresholdCount: number;
  thresholdAverage: number | null;
  purchaseStats: {
    mode: "exact" | "from";
    target: number;
    buyers: number;
    matured: number;
    waiting: number;
    repeated: number;
  }[];
  itemsMinor: number;
  savingsMinor: number;
  orders: { number: number; completedAt: number; name: string; itemsMinor: number; savingMinor: number }[];
  nextOffset: number | null;
};
export async function promoRequest<T>(
  store: string,
  path: string,
  params: Record<string, string> = {},
  options?: {
    body: unknown;
    key?: string;
  },
): Promise<T> {
  const query = new URLSearchParams({ store, ...params });
  const response = await fetch(`/api/seller/promotions${path}?${query}`, {
    method: options ? "POST" : "GET",
    headers: {
      ...sellerSessionHeaders(),
      ...(options && { "Content-Type": "application/json", ...commandHeaders(options.key) }),
    },
    body: options ? JSON.stringify(options.body) : undefined,
  });
  await checkResponse(response);
  return response.json() as Promise<T>;
}
export function example(
  store: string,
  terms: PromoTerms,
  lines: { variantId: string; quantity: number }[],
  confirmed: boolean,
  completed: number,
) {
  return promoRequest<Cart>(store, "/example", {}, { body: { terms, lines, confirmed, completed } });
}
