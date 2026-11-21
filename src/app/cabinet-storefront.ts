import type { ShopContext } from "../shared/contracts/shop-context";
import { loadTelegram } from "./telegram/adapter";
import { telegramLaunch } from "./telegram/launch";

const returnKey = "korzina:cabinet-storefront:return";
const params = typeof location === "undefined" ? undefined : new URLSearchParams(location.search);
const shop = params?.get("shop");
export const cabinetStorefront =
  params?.get("viewer") === "team" && shop && /^[a-z0-9-]{1,63}$/u.test(shop) ? shop : undefined;
const embedded = typeof window !== "undefined" && window.self !== window.top;
let sellerToken: string | undefined;
let buyerToken: string | undefined;

export function buyerStorefrontHeaders() {
  return {
    ...(cabinetStorefront && { "x-korzina-preview-shop": cabinetStorefront }),
    ...(sellerToken && { "x-korzina-preview-session": sellerToken }),
    ...(buyerToken && { Authorization: `Bearer ${buyerToken}` }),
  };
}

export const embeddedStorefront = Boolean(cabinetStorefront && embedded);
export function storeBuyerToken(token?: string) {
  buyerToken = token;
}

export async function loadCabinetStorefront(): Promise<ShopContext | undefined> {
  if (!cabinetStorefront) return;
  const endpoint = `/api/shop?shop=${encodeURIComponent(cabinetStorefront)}`;
  try {
    let response = await fetch(endpoint, { headers: buyerStorefrontHeaders() });
    if (response.status === 404 && embeddedStorefront && telegramLaunch) {
      const telegram = await loadTelegram();
      if (!telegram?.initData) return;
      const login = await fetch("/api/seller/cabinet/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ initData: telegram.initData, store: cabinetStorefront, bearer: true }),
      });
      if (!login.ok) return;
      const session = (await login.json()) as { token?: string };
      sellerToken = session.token;
      if (sellerToken) response = await fetch(endpoint, { headers: buyerStorefrontHeaders() });
    }
    if (response.ok) return (await response.json()) as ShopContext;
  } catch {
    // The existing shell handles inaccessible storefronts.
  }
}

export function openCabinetStorefront(store: string) {
  try {
    const current = new URL(location.href);
    current.searchParams.delete("telegram");
    sessionStorage.setItem(returnKey, JSON.stringify({ href: current.pathname + current.search, top: window.scrollY }));
  } catch {
    // The link can still return to the cabinet homepage.
  }
  const target = new URL("/", location.origin);
  target.searchParams.set("shop", store);
  target.searchParams.set("viewer", "team");
  if (telegramLaunch) target.searchParams.set("telegram", "1");
  location.assign(target);
}

export function returnToCabinet() {
  let target = `/seller?store=${encodeURIComponent(cabinetStorefront ?? "")}`;
  try {
    const raw = sessionStorage.getItem(returnKey);
    const saved = raw ? (JSON.parse(raw) as { href?: string }) : undefined;
    if (saved?.href && /^\/seller(?:[/?]|$)/u.test(saved.href)) target = saved.href;
  } catch {
    // A restricted storage area still permits the default return path.
  }
  const url = new URL(target, location.origin);
  if (telegramLaunch) url.searchParams.set("telegram", "1");
  location.replace(url);
}

export function restoreCabinetPosition(path: string) {
  if (!/^\/seller(?:\/|$)/u.test(path)) return;
  try {
    const raw = sessionStorage.getItem(returnKey);
    const saved = raw ? (JSON.parse(raw) as { href?: string; top?: number }) : undefined;
    const current = new URL(location.href);
    current.searchParams.delete("telegram");
    if (saved?.href === current.pathname + current.search && typeof saved.top === "number") {
      sessionStorage.removeItem(returnKey);
      window.scrollTo({ top: saved.top, behavior: "instant" });
    }
  } catch {
    // Restoration is optional when the browser blocks storage.
  }
}
