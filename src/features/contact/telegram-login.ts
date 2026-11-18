import { checkResponse } from "../../shared/http-error";
import { commandHeaders, shopApi } from "../../shared/shop-api";
import { ensureShopSession } from "../../shared/shop-session";

function wait(signal: AbortSignal, milliseconds: number) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, milliseconds);
    function cancel() {
      clearTimeout(timeout);
      reject(signal.reason);
    }
    signal.addEventListener("abort", cancel, { once: true });
  });
}

export async function startBrowserLogin(signal: AbortSignal) {
  await ensureShopSession();
  const response = await shopApi.api.auth.telegram.start.$post(
    { json: {} },
    { headers: commandHeaders(), init: { signal } },
  );
  await checkResponse(response);
  return response.json();
}

export async function finishBrowserLogin(exchange: string, expiresAt: number, signal: AbortSignal) {
  while (Date.now() < expiresAt) {
    await wait(signal, 3500);
    if (document.visibilityState !== "visible" || !navigator.onLine) continue;
    const response = await shopApi.api.auth.telegram.finish.$post(
      { json: { exchange } },
      { headers: commandHeaders(), init: { signal } },
    );
    await checkResponse(response);
    if (response.status !== 202) return;
  }
  throw new Error("Время входа через Telegram истекло");
}
