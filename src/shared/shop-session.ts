import { checkResponse } from "./http-error";
import { commandHeaders, shopApi } from "./shop-api";

let guest: Promise<void> | undefined;
export function ensureShopSession() {
  guest ??= (async () => {
    const response = await shopApi.api.auth.guest.$post({ json: {} }, { headers: commandHeaders() });
    await checkResponse(response);
  })().catch((error) => {
    guest = undefined;
    throw error;
  });
  return guest;
}
