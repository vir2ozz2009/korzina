import { api } from "../../shared/api";
import { checkResponse } from "../../shared/http-error";
import { pollTelegramLogin } from "../../shared/poll-telegram-login";
import { commandHeaders } from "../../shared/shop-api";
import {
  finishTelegramAttempt,
  type TelegramBrowserAttempt,
  telegramReturnPath,
} from "../../shared/telegram-browser-attempt";

export async function startCabinetLogin(signal: AbortSignal, store?: string) {
  const response = await api.api.seller.cabinet.start.$post(
    { json: { returnPath: telegramReturnPath(), store } },
    { headers: commandHeaders(), init: { signal } },
  );
  await checkResponse(response);
  return response.json();
}

export function finishCabinetLogin({ exchange, expiresAt }: TelegramBrowserAttempt, signal: AbortSignal) {
  return pollTelegramLogin(expiresAt, signal, () =>
    finishTelegramAttempt("seller", exchange, signal, async () => {
      const response = await api.api.seller.cabinet.finish.$post(
        { json: { exchange } },
        { headers: commandHeaders(), init: { signal } },
      );
      await checkResponse(response);
      return response.status === 202 ? undefined : "done";
    }),
  );
}
