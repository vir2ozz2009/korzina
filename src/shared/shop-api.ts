import { bootstrap } from "../app/bootstrap";
import { api, apiForShop } from "./api";
import { defaultShopTimeZone } from "./datetime";

export const shopApi = bootstrap ? apiForShop(bootstrap.slug) : api;
export const shopKey = bootstrap?.id ?? "unknown";
export const shopTimeZone = bootstrap?.timeZone ?? bootstrap?.adminSettings?.timeZone ?? defaultShopTimeZone;
export const commandHeaders = (key: string = crypto.randomUUID()) => ({ "Idempotency-Key": key });

export function buyerOrderSearch(previous: { shop?: string }) {
  return { shop: import.meta.env.DEV_SCREENS ? (bootstrap?.slug ?? previous.shop) : undefined };
}
