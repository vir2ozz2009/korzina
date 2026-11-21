import type { AuthSecrets } from "../../auth/config";
import { telegramApi } from "../../auth/telegram-api";
import { miniAppAddress } from "../admin/shop-bot";
import { beginStaffChat, connectStaffChat, platformStaffBot } from "./bot";
import { redeemStaffInvite } from "./redeem";

export const staffInvitePattern = /^\/start staff_([A-Za-z0-9_-]{43})$/;
const instructions = {
  invalid: "Ссылка недействительна. Попросите владельца прислать новую.",
  expired: "Срок действия приглашения истёк. Попросите владельца прислать новую ссылку.",
  revoked: "Приглашение отозвано. Попросите владельца прислать новую ссылку.",
  used: "Приглашение уже использовано. Попросите владельца прислать новую ссылку.",
  member: "У вас уже есть доступ к магазину",
};

export async function replyStaffChat(
  env: Env & AuthSecrets,
  shop: string,
  bot: string,
  chatId: number,
  token: string,
  origin: string,
) {
  await beginStaffChat(env.PLATFORM, env, shop, bot, String(chatId));
  await telegramApi(token, "sendMessage", {
    chat_id: chatId,
    text: "Откройте кабинет продавца",
    reply_markup: {
      inline_keyboard: [[{ text: "Открыть кабинет", web_app: { url: miniAppAddress(origin, shop, true) } }]],
    },
  });
}

export async function answerStaffInvite(
  database: D1Database,
  options: {
    raw: string;
    from: { id: number; first_name?: string; last_name?: string };
    origin: string;
    bot: string;
    channel?: { shop: string; bot: string };
  },
) {
  const { raw, from, origin, bot, channel } = options;
  const name = [from.first_name, from.last_name].filter(Boolean).join(" ").trim().slice(0, 100);
  const outcome = await redeemStaffInvite(database, {
    token: raw,
    telegram: String(from.id),
    name,
    now: Date.now(),
    channel,
  });
  if (outcome.state === "accepted")
    await connectStaffChat(database, outcome.shop, channel?.bot ?? platformStaffBot, String(from.id));
  await telegramApi(bot, "sendMessage", {
    chat_id: from.id,
    text: outcome.state === "accepted" ? "Доступ к магазину открыт" : instructions[outcome.state],
    ...(outcome.state === "accepted" && {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Открыть кабинет",
              web_app: { url: miniAppAddress(origin, outcome.shop, true) },
            },
          ],
        ],
      },
    }),
  });
}
