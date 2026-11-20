import { formatMinor } from "../../../src/shared/money";
import { decryptBotToken } from "../../auth/bot-token";
import type { AuthSecrets } from "../../auth/config";
import { TelegramRequestError, telegramApi } from "../../auth/telegram-api";
import { managedBot } from "../../platform/admin/shop-bot";
import { storefrontUrl } from "../../platform/storefront-url";
import { calendarDate, scheduleClock } from "../fulfillment/schedule";

type Queued = {
  event_key: string;
  kind: string;
  order_number: number;
  recipient: string;
  amount: number;
  currency: string;
  attempts: number;
};

async function expandNewOrders(storage: DurableObjectStorage, platform: D1Database, shop: string, now: number) {
  const orders = storage.sql
    .exec<{ number: number; total: number; currency: string }>(
      `SELECT p.order_number AS number,i.total_minor AS total,i.currency
    FROM order_outbox p JOIN seller_order_index i ON i.number=p.order_number
    WHERE p.order_number>CAST((SELECT value FROM settings WHERE key='seller_notification_watermark') AS INTEGER)
    ORDER BY p.order_number LIMIT 20`,
    )
    .toArray();
  if (!orders.length) return false;
  const { results } = await platform
    .withSession("first-primary")
    .prepare(`
    SELECT DISTINCT a.telegram_id AS recipient
    FROM memberships m JOIN accounts a ON a.id=m.account_id
    WHERE m.shop_id=? AND m.revoked_at IS NULL AND m.role IN ('owner','employee') AND a.telegram_id IS NOT NULL`)
    .bind(shop)
    .all<{ recipient: string }>();
  storage.transactionSync(() => {
    for (const order of orders)
      for (const { recipient } of results)
        storage.sql.exec(
          `INSERT OR IGNORE INTO order_notification_outbox(event_key,kind,order_number,recipient,amount,currency,due_at)
           VALUES(?,'new',?,?,?,?,?)`,
          `new:${order.number}:${recipient}`,
          order.number,
          recipient,
          order.total,
          order.currency,
          now,
        );
    storage.sql.exec(
      "UPDATE settings SET value=? WHERE key='seller_notification_watermark'",
      orders.at(-1)?.number ?? 0,
    );
  });
  return orders.length === 20;
}

export async function sendOrderNotifications(storage: DurableObjectStorage, env: Env & AuthSecrets, now = Date.now()) {
  const shop = storage.sql
    .exec<{ value: string }>("SELECT value FROM settings WHERE key='shop_id'")
    .toArray()[0]?.value;
  if (!shop) return;
  const more = await expandNewOrders(storage, env.PLATFORM, shop, now);
  const queue = storage.sql
    .exec<Queued>("SELECT * FROM order_notification_outbox WHERE due_at<=? ORDER BY due_at LIMIT 10", now)
    .toArray();
  if (queue.length) {
    const bot = await managedBot(env.PLATFORM, shop);
    const token = bot?.token ? await decryptBotToken(bot.token, shop, env.ENCRYPTION_KEY) : env.PLATFORM_BOT_TOKEN;
    const origin = env.APP_ENV === "production" ? "https://korzina.app" : "https://demo.korzina.app";
    const buyerSlug =
      token && queue.some(({ kind }) => kind !== "new")
        ? await env.PLATFORM.withSession("first-primary")
            .prepare("SELECT slug FROM shops WHERE id=?")
            .bind(shop)
            .first<string>("slug")
        : null;
    const buyerStorefront = buyerSlug ? storefrontUrl(origin, env.APP_ENV, buyerSlug) : undefined;
    for (const event of queue) {
      // Claim before contacting Telegram: sendMessage has no idempotency key.
      const claim = storage.sql.exec("DELETE FROM order_notification_outbox WHERE event_key=?", event.event_key);
      if (!claim.rowsWritten || !token) continue;
      try {
        await telegramApi(token, "sendMessage", telegramMessage(storage, origin, shop, event, now, buyerStorefront));
      } catch (error) {
        if (error instanceof TelegramRequestError && error.retryable && event.attempts < 7) {
          storage.sql.exec(
            `INSERT INTO order_notification_outbox(event_key,kind,order_number,recipient,amount,currency,due_at,attempts)
             VALUES(?,?,?,?,?,?,?,?)`,
            event.event_key,
            event.kind,
            event.order_number,
            event.recipient,
            event.amount,
            event.currency,
            now + Math.min(3_600_000, 10_000 * 2 ** event.attempts),
            event.attempts + 1,
          );
        } else {
          console.warn("Не удалось подтвердить доставку уведомления о заказе");
        }
      }
    }
  }
  const due = storage.sql
    .exec<{ due: number | null }>("SELECT MIN(due_at) AS due FROM order_notification_outbox")
    .one().due;
  const next = more ? now + 1000 : due === null ? undefined : Math.max(due, now + 1000);
  if (next !== undefined) {
    const existing = await storage.getAlarm();
    if (existing === null || existing > next) await storage.setAlarm(next);
  }
}

export function telegramMessage(
  storage: DurableObjectStorage,
  origin: string,
  shop: string,
  event: Omit<Queued, "event_key" | "attempts">,
  now: number,
  buyerStorefront?: string,
) {
  const number = event.order_number;
  const amount = formatMinor(event.amount, event.currency);
  const ref = `по заказу №${number}`;
  const chat_id = event.recipient;
  if (event.kind !== "new") {
    const url = buyerStorefront ? new URL(buyerStorefront) : undefined;
    if (url) url.pathname = `/orders/${number}`;
    const text =
      event.kind === "debt"
        ? `Доплатите ${amount} ${ref}`
        : event.kind === "refund"
          ? `Магазин вернёт вам ${amount} ${ref}`
          : `Оплата ${ref} подтверждена`;
    return { chat_id, text, ...(url && { reply_markup: orderKeyboard(url, "Открыть заказ") }) };
  }
  const order = storage.sql
    .exec<{ date: string | null; start: string | null; method: string; timeZone: string }>(
      `SELECT json_extract(snapshot,'$.time.date') AS date,
        substr(json_extract(snapshot,'$.time.slotId'),1,5) AS start,
        json_extract(snapshot,'$.receiving.mode') AS method,
        COALESCE(
          (SELECT json_extract(value,'$.timeZone') FROM settings WHERE key='receiving_schedule'),
          (SELECT json_extract(value,'$.timeZone') FROM settings WHERE key='admin_settings'),
          'Asia/Ho_Chi_Minh'
        ) AS timeZone
      FROM orders WHERE number=?`,
      number,
    )
    .one();
  const url = new URL(`/api/platform/storefront/${encodeURIComponent(shop)}`, origin);
  url.searchParams.set("destination", "seller");
  url.searchParams.set("order", String(number));
  const method = order.method === "delivery" ? "Доставка" : "Самовывоз";
  const receiving = [order.start || "Время согласуем", method];
  if (order.date) receiving.unshift(receivingDate(order.date, order.timeZone, now));
  return {
    chat_id,
    text: `Новый заказ №${number} · ${amount}\n${receiving.join(" · ")}`,
    reply_markup: orderKeyboard(url, "Открыть"),
  };
}

function orderKeyboard(url: URL, text: string) {
  return { inline_keyboard: [[{ text, web_app: { url: url.href } }]] };
}

const dayAndMonth = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });
const weekday = new Intl.DateTimeFormat("ru-RU", { weekday: "short", timeZone: "UTC" });

function receivingDate(date: string, timeZone: string, now: number) {
  const { today } = scheduleClock(timeZone, now);
  const epoch = Date.parse(`${date}T00:00:00Z`);
  const day = date === today ? "Сегодня" : date === calendarDate(today, 1) ? "Завтра" : weekday.format(epoch);
  return `${day[0].toLocaleUpperCase("ru-RU")}${day.slice(1)}, ${dayAndMonth.format(epoch)}`;
}
