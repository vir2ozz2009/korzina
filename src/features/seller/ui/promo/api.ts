import type { z } from "zod";
import type { Cart } from "../../../../shared/contracts/cart";
import type { PromoOffer, PromoPrice, PublicPromo, promoExampleInput } from "../../../../shared/contracts/promo";
import { checkResponse } from "../../../../shared/http-error";
import { commandHeaders } from "../../../../shared/shop-api";
import type { ReceivingState } from "../../../receiving";
import { sellerSessionHeaders } from "../../api";

export type PromoCatalog = {
  variants: { id: string; name: string; productId: string; productName: string; priceMinor?: number }[];
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
  groups?: { type: "gift" | "bundle"; count: number; gifts: number; label?: string };
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
    signal?: AbortSignal;
  },
): Promise<T> {
  const query = new URLSearchParams({ store, ...params });
  const response = await fetch(`/api/seller/promotions${path}?${query}`, {
    signal: options?.signal,
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
type ExampleQuote = Cart & {
  exampleProblem: string | null;
  receiving: ReceivingState["receiving"];
  availability: ReceivingState["availability"];
  confirmed: boolean;
  completed: number;
  publicOffers: PublicPromo[];
  timeZone: string;
  fulfillment: Pick<ReceivingState, "delivery" | "pickup" | "unavailable" | "acceptingOrders" | "closedMessage">;
  method: "pickup" | "delivery" | null;
  deliveryMinor: number | null;
  payableMinor: number;
};
export function example(store: string, body: z.input<typeof promoExampleInput>, signal?: AbortSignal) {
  return promoRequest<ExampleQuote>(store, "/example", {}, { body, signal });
}
