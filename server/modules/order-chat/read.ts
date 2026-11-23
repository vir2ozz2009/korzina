import type { OrderStage } from "../../../src/shared/contracts/buyer-order";
import type { OrderChatEntry, OrderChatHistory, OrderChatList } from "../../../src/shared/contracts/order-chat";
import { ApiError } from "../../../src/shared/errors";
import { type ChatActor, chatOrder } from "./access";

type EntryRow = { id: number; createdAt: number; event: string; details: string | null };
const visible = `event IN ('chat.buyer','chat.seller','order.accept','order.markReady','order.handOver','order.markPickedUp',
'order.complete','order.cancel','order.cancelled','order.recordPayment','composition.proposed','composition.applied',
'composition.answered','composition.expired','time.pending','time.accepted','time.withdrawn','time.kept')`;
const labels: Record<string, string> = {
  "order.accept": "Заказ принят",
  "order.markReady": "Заказ готов",
  "order.handOver": "Передан курьеру",
  "order.markPickedUp": "Заказ выдан",
  "order.complete": "Заказ завершён",
  "order.cancel": "Заказ отменён",
  "order.cancelled": "Заказ отменён",
  "order.recordPayment": "Оплата получена",
  "composition.proposed": "Магазин предлагает замену",
  "composition.applied": "Изменения сохранены",
  "composition.answered": "Получен ответ по замене",
  "composition.expired": "Срок ответа истёк",
  "time.pending": "Предложено другое время",
  "time.accepted": "Время изменено",
  "time.withdrawn": "Предложение отозвано",
  "time.kept": "Время осталось прежним",
};
const pageSize = 20;

export function orderChatHistory(
  storage: DurableObjectStorage,
  actor: ChatActor,
  number: number,
  { before, after }: { before?: number; after?: number },
): OrderChatHistory {
  if (before !== undefined && after !== undefined) throw new ApiError("VALIDATION", "Выберите направление истории");
  const order = chatOrder(storage, number, actor);
  const older = after === undefined;
  const rows = storage.sql
    .exec<EntryRow>(
      `SELECT id,created_at AS createdAt,event,details FROM buyer_order_events WHERE order_number=? AND ${visible}
      ${before ? "AND id<?" : after ? "AND id>?" : ""}
      ORDER BY id ${older ? "DESC" : "ASC"} LIMIT ?`,
      number,
      ...((before ?? after) ? [before ?? after ?? 0] : []),
      pageSize + 1,
    )
    .toArray();
  const page = rows.slice(0, pageSize);
  const entries = page.map((row): OrderChatEntry => {
    const { id, createdAt, event } = row;
    if (event === "chat.buyer" || event === "chat.seller") {
      const payload = JSON.parse(row.details ?? "{}") as { text?: string; mediaId?: string };
      return { id, createdAt, kind: "message", side: event === "chat.buyer" ? "buyer" : "seller", ...payload };
    }
    const change =
      event === "composition.proposed" || event === "time.pending"
        ? (JSON.parse(row.details ?? "{}") as { changeId?: string; change?: { id?: string; by?: ChatActor["side"] } })
        : undefined;
    const pending =
      event === "composition.proposed"
        ? !!order.compositionId && order.compositionId === change?.changeId
        : !!order.timeChangeId && order.timeChangeId === change?.change?.id;
    return { id, createdAt, event, kind: "event", side: "system", ...(pending && { pending: true }) };
  });
  const cursor = rows.length > pageSize ? page.at(-1)?.id : undefined;
  const canSeeBalance = actor.side === "buyer" || actor.payments;
  return {
    entries: older ? entries.reverse() : entries,
    cursor,
    writable: !!order.writable,
    ...(canSeeBalance &&
      order.debt && { balance: { amountMinor: order.debt, currency: order.currency, kind: "topUp" as const } }),
    ...(canSeeBalance &&
      order.refund && { balance: { amountMinor: order.refund, currency: order.currency, kind: "refund" as const } }),
  };
}

export function orderChatList(storage: DurableObjectStorage, actor: ChatActor, cursor?: string): OrderChatList {
  const buyer = actor.side === "buyer";
  const unread = buyer ? "buyer_unread" : "seller_unread";
  const filters = [];
  const args: SqlStorageValue[] = [];
  if (buyer) {
    filters.push("o.customer=?");
    args.push(actor.id);
  }
  if (cursor) {
    const [group, time, order] = cursor.split(".").map(Number);
    filters.push(`((c.${unread}>0),c.last_at,c.order_number)<(?,?,?)`);
    args.push(group, time, order);
  }
  const rows = storage.sql
    .exec<{ number: number; stage: OrderStage; lastAt: number; preview: string; unread: number; waiting: number }>(
      `SELECT c.order_number AS number,o.status AS stage,c.last_at AS lastAt,c.last_preview AS preview,
      c.${unread} AS unread,c.waiting FROM order_chat c JOIN orders o ON o.number=c.order_number
      ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
      ORDER BY (c.${unread}>0) DESC,c.last_at DESC,c.order_number DESC LIMIT ?`,
      ...args,
      pageSize + 1,
    )
    .toArray();
  const chats = rows.slice(0, pageSize).map(({ waiting, preview, ...chat }) => ({
    ...chat,
    waiting: !!waiting,
    preview: preview.startsWith("message:") ? preview.slice(8) : (labels[preview] ?? preview),
  }));
  const last = chats.at(-1);
  return {
    chats,
    cursor: last && rows.length > pageSize ? `${+!!last.unread}.${last.lastAt}.${last.number}` : undefined,
  };
}
