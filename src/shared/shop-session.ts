import { checkResponse } from "./http-error";
import { commandHeaders, shopApi } from "./shop-api";

let guest: Promise<void> | undefined;
let telegram: Promise<void> | undefined;
export function ensureShopSession(): Promise<void> {
  if (telegram)
    return telegram.catch(() => {
      telegram = undefined;
      return ensureShopSession();
    });
  guest ??= (async () => {
    const response = await shopApi.api.auth.guest.$post({ json: {} }, { headers: commandHeaders() });
    await checkResponse(response);
  })().catch((error) => {
    guest = undefined;
    throw error;
  });
  return guest;
}

export function authenticateTelegram(initData: string) {
  telegram ??= (async () => {
    await guest?.catch(() => {});
    const result = await shopApi.api.auth.telegram.$post({ json: { initData } }, { headers: commandHeaders() });
    await checkResponse(result);
  })();
  return telegram;
}
