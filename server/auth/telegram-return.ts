import { ApiError } from "../../src/shared/errors";
import { telegramApi } from "./telegram-api";

export function telegramReturnUrl(request: Request, path = "/", seller = false) {
  if (!path.startsWith("/") || /^\/\//.test(path) || /[\\#\s]/u.test(path))
    throw new ApiError("VALIDATION", "Некорректный адрес возврата");
  const origin = new URL(request.url).origin;
  const url = new URL(path, origin);
  const sellerPath = /^\/seller(?:\/|$)/u.test(url.pathname);
  if (url.origin !== origin || sellerPath !== seller || /^\/api(?:\/|$)/iu.test(url.pathname))
    throw new ApiError("VALIDATION", "Некорректный адрес возврата");
  url.hash = "telegram-return";
  return url.href;
}

export function answerBrowserLogin(token: string, chatId: number, returnUrl: string | null | undefined) {
  return telegramApi(token, "sendMessage", {
    chat_id: chatId,
    ...(returnUrl
      ? {
          text: "Готово! Вы вошли",
          reply_markup: { inline_keyboard: [[{ text: "Вернуться в магазин", url: returnUrl }]] },
        }
      : { text: "Ссылка для входа истекла. Начните заново в браузере." }),
  });
}
