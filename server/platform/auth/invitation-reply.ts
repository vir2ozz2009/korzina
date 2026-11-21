import { telegramApi } from "../../auth/telegram-api";
import { redeemOwnerInvite } from "../admin/owner-invite";
import { miniAppAddress } from "../admin/shop-bot";
import { connectStaffChat, platformStaffBot } from "../team/bot";

export const invitationPattern = /^\/start inv_([A-Za-z0-9_-]{43})$/;
const msg = {
  invalid: "Ссылка недействительна или истекла. Попросите администратора прислать новую.",
  used: "Ссылка уже использована. Попросите администратора прислать новую.",
};

export async function answerOwnerInvite(
  database: D1Database,
  options: {
    raw: string;
    from: { id: number; first_name?: string; last_name?: string };
    origin: string;
    bot: string;
    platformBot?: string;
    shopId?: string;
    botKey?: string;
  },
) {
  const { raw, from, origin, bot, platformBot, shopId, botKey } = options;
  const name = [from.first_name, from.last_name].filter(Boolean).join(" ").trim().slice(0, 100);
  const result = await redeemOwnerInvite(database, raw, String(from.id), name, shopId);
  if (result.state !== "accepted") {
    await telegramApi(bot, "sendMessage", { chat_id: from.id, text: msg[result.state] });
    return;
  }
  await connectStaffChat(database, result.shopId, botKey ?? platformStaffBot, String(from.id));
  await telegramApi(bot, "sendMessage", {
    chat_id: from.id,
    text: `Магазин «${result.name}» ждёт вас`,
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "Открыть кабинет",
            web_app: { url: miniAppAddress(origin, result.shopId, true) },
          },
        ],
      ],
    },
  });
  if (result.previousOwner && platformBot) {
    await telegramApi(platformBot, "sendMessage", {
      chat_id: result.previousOwner,
      text: `В магазине «${result.name}» назначен новый владелец.`,
    }).catch(() => {});
  }
}
