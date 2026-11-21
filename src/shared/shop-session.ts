import { embeddedStorefront, storeBuyerToken } from "../app/cabinet-storefront";
import { checkResponse } from "./http-error";
import { commandHeaders, shopApi, shopKey } from "./shop-api";

let guest: Promise<void> | undefined;
let telegram: Promise<void> | undefined;
export function ensureShopSession(): Promise<void> {
  if (telegram)
    return telegram.catch(() => {
      telegram = undefined;
      return ensureShopSession();
    });
  guest ??= (async () => {
    const response = await shopApi.api.auth.guest.$post(
      { json: embeddedStorefront ? { bearer: true } : {} },
      { headers: commandHeaders() },
    );
    await checkResponse(response);
    if (embeddedStorefront && response.status === 201) storeBuyerToken((await response.json()).token);
  })().catch((error) => {
    guest = undefined;
    throw error;
  });
  return guest;
}

export function authenticateTelegram(initData: string) {
  telegram ??= (async () => {
    await guest?.catch(() => {});
    const result = await shopApi.api.auth.telegram.$post(
      { json: { initData, ...(embeddedStorefront && { bearer: true }) } },
      { headers: commandHeaders() },
    );
    await checkResponse(result);
    if (embeddedStorefront && result.status === 201) storeBuyerToken((await result.json()).token);
    rememberBuyer(true);
  })();
  return telegram;
}

const buyerMarker = `korzina:${shopKey}:buyer`;
export function rememberBuyer(known: boolean) {
  try {
    if (known) localStorage.setItem(buyerMarker, "1");
    else localStorage.removeItem(buyerMarker);
  } catch {
    // The verified session can still be used in this tab.
  }
}
export function hasBuyerMarker() {
  try {
    return localStorage.getItem(buyerMarker) === "1";
  } catch {
    return false;
  }
}

export function clearClientSession() {
  storeBuyerToken();
  guest = undefined;
  telegram = undefined;
  rememberBuyer(false);
}
