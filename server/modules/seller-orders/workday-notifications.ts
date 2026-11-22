import type { NotificationTopic } from "../../../src/shared/contracts/staff";
import type { AuthSecrets } from "../../auth/config";
import { TelegramRequestError, telegramApi } from "../../auth/telegram-api";
import { storefrontUrl } from "../../platform/storefront-url";
import { staffBot, staffBotToken } from "../../platform/team/bot";
import { staffRecipients } from "../../platform/team/notifications";

const topics: Record<string, NotificationTopic> = {
  receipt: "paymentsAndReceipts",
  cancellation: "cancellations",
  stock: "lowStock",
};
const stages: Record<string, string> = {
  accepted: "Заказ принят",
  ready: "Готов к выдаче",
  handed: "Передан курьеру",
  completed: "Завершён",
  cancelled: "Отменён",
};
type Notice = {
  id: string;
  kind: string;
  order_number: number | null;
  recipient: string | null;
  product: string | null;
  variant: string | null;
  remaining: number | null;
  expires_at: number;
};
type Delivery = Notice & { chat: string; attempts: number };

function message(event: Delivery, sellerUrl: URL, buyerUrl: URL | undefined) {
  const number = event.order_number;
  const chat_id = event.chat;
  if (event.kind === "stock") {
    const title = event.remaining
      ? `Заканчивается: ${event.product}, осталось ${event.remaining} шт.`
      : `Закончился: ${event.product}`;
    return { chat_id, text: event.variant ? `${title}\n${event.variant}` : title };
  }
  const url = event.recipient ? buyerUrl && new URL(buyerUrl) : new URL(sellerUrl);
  if (url && event.recipient) url.pathname = `/orders/${number}`;
  if (url && !event.recipient) url.searchParams.set("order", String(number));
  const text = event.recipient
    ? `${stages[event.kind]}\nЗаказ №${number}`
    : event.kind === "receipt"
      ? `Чек на проверке · заказ №${number}`
      : `Заказ №${number} отменён`;
  return {
    chat_id,
    text,
    ...(url && { reply_markup: { inline_keyboard: [[{ text: "Открыть заказ", web_app: { url: url.href } }]] } }),
  };
}

export async function sendWorkdayNotifications(
  storage: DurableObjectStorage,
  env: Env & AuthSecrets,
  shop: string,
  now: number,
) {
  const sql = storage.sql;
  const pending = sql
    .exec<Notice>("SELECT * FROM workday_notice WHERE expanded=0 AND expires_at>? ORDER BY expires_at LIMIT 20", now)
    .toArray();
  const hasDue = sql
    .exec("SELECT 1 FROM workday_notice_delivery WHERE outcome IS NULL AND due_at<=? LIMIT 1", now)
    .toArray().length;

  let canDispatch = false;
  if (pending.length || hasDue) {
    const bot = await staffBot(env.PLATFORM, shop, env);
    const token = await staffBotToken(bot, shop, env);
    if (token) {
      canDispatch = true;
      const audience = new Map<NotificationTopic, string[]>();
      for (const event of pending) {
        const topic = topics[event.kind];
        let recipients = event.recipient ? [event.recipient] : audience.get(topic);
        if (!recipients) {
          recipients = await staffRecipients(env.PLATFORM, shop, bot.id, undefined, topic);
          audience.set(topic, recipients);
        }
        storage.transactionSync(() => {
          if (!sql.exec("UPDATE workday_notice SET expanded=1 WHERE id=? AND expanded=0", event.id).rowsWritten) return;
          for (const recipient of recipients)
            sql.exec(
              "INSERT OR IGNORE INTO workday_notice_delivery(event,recipient,due_at) VALUES(?,?,?)",
              event.id,
              recipient,
              now,
            );
        });
      }
      const queue = sql
        .exec<Delivery>(
          `SELECT e.*,d.recipient AS chat,d.attempts FROM workday_notice_delivery d JOIN workday_notice e ON e.id=d.event
         WHERE d.outcome IS NULL AND d.due_at<=? AND e.expires_at>? ORDER BY d.due_at LIMIT 10`,
          now,
          now,
        )
        .toArray();
      const origin = env.APP_ENV === "production" ? "https://korzina.app" : "https://demo.korzina.app";
      const sellerUrl = new URL(`/api/platform/storefront/${encodeURIComponent(shop)}`, origin);
      sellerUrl.searchParams.set("destination", "seller");
      const slug = queue.some(({ recipient }) => recipient)
        ? await env.PLATFORM.withSession("first-primary")
            .prepare("SELECT slug FROM shops WHERE id=?")
            .bind(shop)
            .first<string>("slug")
        : null;
      const buyerUrl = slug ? new URL(storefrontUrl(origin, env.APP_ENV, slug)) : undefined;
      for (const event of queue) {
        const allowed = event.recipient
          ? sql
              .exec(
                "SELECT 1 FROM orders WHERE number=? AND customer=? AND json_extract(snapshot,'$.telegramLinked')=1",
                event.order_number,
                `telegram:${event.chat}`,
              )
              .toArray().length > 0
          : (await staffRecipients(env.PLATFORM, shop, bot.id, event.chat, topics[event.kind])).length > 0;
        // An interrupted send has unknown outcome. Claim before the request, retry only explicit failures.
        const claim = sql.exec(
          `UPDATE workday_notice_delivery SET outcome=?
          WHERE event=? AND recipient=? AND outcome IS NULL`,
          allowed ? "unknown" : "revoked",
          event.id,
          event.chat,
        );
        if (!claim.rowsWritten || !allowed) continue;
        try {
          await telegramApi(token, "sendMessage", message(event, sellerUrl, buyerUrl));
          sql.exec(
            "UPDATE workday_notice_delivery SET outcome='sent' WHERE event=? AND recipient=?",
            event.id,
            event.chat,
          );
        } catch (error) {
          if (error instanceof TelegramRequestError && error.retryable && event.attempts < 7) {
            const retry = Math.max(
              error.retryAfterMs,
              Math.min(3_600_000, 10_000 * 2 ** event.attempts) * (1 + Math.random() / 4),
            );
            sql.exec(
              `UPDATE workday_notice_delivery SET outcome=NULL,attempts=attempts+1,due_at=?
              WHERE event=? AND recipient=?`,
              now + Math.ceil(retry),
              event.id,
              event.chat,
            );
          } else if (!(error instanceof TelegramRequestError) || error.retryable || error.permanent) {
            sql.exec(
              "UPDATE workday_notice_delivery SET outcome='failed' WHERE event=? AND recipient=?",
              event.id,
              event.chat,
            );
          }
        }
      }
    }
  }

  sql.exec(
    "DELETE FROM workday_notice WHERE rowid IN (SELECT rowid FROM workday_notice WHERE expires_at<=? LIMIT 100)",
    now,
  );
  const expiry = sql.exec<{ due: number | null }>("SELECT MIN(expires_at) AS due FROM workday_notice").one().due;
  const queued = sql
    .exec<{ due: number | null }>("SELECT MIN(due_at) AS due FROM workday_notice_delivery WHERE outcome IS NULL")
    .one().due;
  const next = Math.min(
    expiry ?? Infinity,
    Math.max(hasDue && !canDispatch ? Infinity : (queued ?? Infinity), now + 1000),
  );
  const due = canDispatch && pending.length >= 20 ? now + 1000 : next;
  if (Number.isFinite(due)) {
    const current = await storage.getAlarm();
    const alarm = Math.max(now + 1000, due);
    if (current === null || current > alarm) await storage.setAlarm(alarm);
  }
}
