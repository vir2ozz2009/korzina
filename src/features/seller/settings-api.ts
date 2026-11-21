import { useQuery } from "@tanstack/react-query";
import type { FulfillmentSettings, ReceivingPause } from "../../shared/contracts/receiving";
import type { ReceivingMethod, Schedule } from "../../shared/contracts/receiving-time";
import type { PaymentOption } from "../../shared/contracts/seller-payments";
import type { SaveReceivingHours } from "../../shared/contracts/seller-receiving";
import type { StoreProfile } from "../../shared/contracts/seller-shop-profile";
import { checkResponse } from "../../shared/http-error";
import { commandHeaders } from "../../shared/shop-api";
import type { ShopTheme } from "../../shared/theme-presets";
import { sellerSessionHeaders } from "./api";

export type SellerRevision = { revision: number; canWrite: boolean; author?: string; updatedAt?: number };
export type ReceivingSettingsData = SellerRevision &
  Pick<FulfillmentSettings, "delivery" | "pickup" | "requiredDetails"> & {
    maps: boolean;
    mapsFallback: boolean;
    minimumMinor: number;
    currency: string;
  };
export type ReceivingHoursData = SellerRevision & {
  timeZone: string;
  settings: Omit<SaveReceivingHours, "expectedRevision"> | null;
  schedule: Schedule | null;
};
export type PauseData = SellerRevision & {
  adminPaused: boolean;
  timeZone: string;
  methods: { method: ReceivingMethod; pause: ReceivingPause | null }[];
};
export type PaymentsData = SellerRevision & {
  options: (PaymentOption | Pick<PaymentOption, "id" | "name" | "template">)[];
};
export type ProfileData = SellerRevision & {
  country: string | null;
  currency: string;
  slug: string;
  maps: boolean;
  profile: Omit<StoreProfile, "logo"> & { logo: (NonNullable<StoreProfile["logo"]> & { src: string }) | null };
};
export type ThemeData = SellerRevision & { theme: ShopTheme };

export async function sellerSettingRequest<T>(
  store: string,
  path: string,
  init: { signal?: AbortSignal; method?: "POST" | "PUT"; body?: string; key?: string } = {},
): Promise<T> {
  const url = new URL(`/api/seller/${path}`, location.origin);
  url.searchParams.set("store", store);
  const { signal, method, body, key } = init;
  const response = await fetch(url, {
    signal,
    method,
    body,
    cache: "no-store",
    headers: {
      ...sellerSessionHeaders(),
      ...(body && { "Content-Type": "application/json" }),
      ...(key && commandHeaders(key)),
    },
  });
  await checkResponse(response);
  return response.json();
}
export function useSellerSetting<T>(store: string, path: string) {
  return useQuery({
    queryKey: ["seller-settings", store, path],
    retry: false,
    queryFn: ({ signal }) => sellerSettingRequest<T>(store, path, { signal }),
  });
}
