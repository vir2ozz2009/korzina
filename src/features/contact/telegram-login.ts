import { checkResponse } from "../../shared/http-error";
import { pollTelegramLogin } from "../../shared/poll-telegram-login";
import { commandHeaders, shopApi } from "../../shared/shop-api";
import { ensureShopSession, rememberBuyer } from "../../shared/shop-session";
import { finishTelegramAttempt, telegramReturnPath } from "../../shared/telegram-browser-attempt";

export async function startBrowserLogin(signal: AbortSignal) {
  await ensureShopSession();
  const response = await shopApi.api.auth.telegram.start.$post(
    { json: { returnPath: telegramReturnPath() } },
    { headers: commandHeaders(), init: { signal } },
  );
  await checkResponse(response);
  return response.json();
}

export async function finishBrowserLogin(exchange: string, expiresAt: number, signal: AbortSignal) {
  const result = await pollTelegramLogin(expiresAt, signal, () =>
    finishTelegramAttempt("contact", exchange, signal, async () => {
      const response = await shopApi.api.auth.telegram.finish.$post(
        { json: { exchange } },
        { headers: commandHeaders(), init: { signal } },
      );
      await checkResponse(response);
      if (response.status === 202) return undefined;
      const result = await response.json();
      if ("mergeRequired" in result) return "merge" as const;
      return "done" as const;
    }),
  );
  if (result === "done") rememberBuyer(true);
  return result;
}

export async function confirmBrowserMerge(exchange: string, signal: AbortSignal) {
  await finishTelegramAttempt("contact", exchange, signal, async () => {
    const response = await shopApi.api.auth.telegram.finish.$post(
      { json: { exchange, merge: true } },
      { headers: commandHeaders(), init: { signal } },
    );
    await checkResponse(response);
    if (response.status === 202) throw new Error("Подтвердите вход в Telegram");
    return "done";
  });
  rememberBuyer(true);
}
