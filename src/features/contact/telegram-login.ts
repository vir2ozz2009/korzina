import { checkResponse } from "../../shared/http-error";
import { commandHeaders, shopApi } from "../../shared/shop-api";
import { ensureShopSession, rememberBuyer } from "../../shared/shop-session";

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
    if (response.status !== 202) {
      const result = await response.json();
      if ("mergeRequired" in result) return "merge" as const;
      rememberBuyer(true);
      return "done" as const;
    }
  }
  throw new Error("Время входа через Telegram истекло");
}

export async function confirmBrowserMerge(exchange: string, signal: AbortSignal) {
  const response = await shopApi.api.auth.telegram.finish.$post(
    { json: { exchange, merge: true } },
    { headers: commandHeaders(), init: { signal } },
  );
  await checkResponse(response);
  if (response.status === 202) throw new Error("Подтвердите вход в Telegram");
  rememberBuyer(true);
}
