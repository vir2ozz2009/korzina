import type { ChatSend, OrderChatEntry } from "../../../src/shared/contracts/order-chat";
import { ApiError } from "../../../src/shared/errors";
import type { CommandIdentity } from "../../middleware/idempotency";
import { executeCommand } from "../../shop/commands";
import type { ShopEnv } from "../../shop/env";
import { type ChatActor, chatOrder } from "./access";

type Shop = ShopEnv["Bindings"];

export function sendChatMessage(
  env: Shop,
  actor: ChatActor,
  number: number,
  input: ChatSend,
  identity: CommandIdentity,
) {
  const { storage } = env;
  return executeCommand(storage, env.db, `chat:${actor.side}:${actor.id}:${number}`, identity, () => {
    const now = Date.now();
    const order = chatOrder(storage, number, actor, now);
    if (!order.writable) throw new ApiError("CHAT_CLOSED", "Переписка закрыта. История доступна для чтения.");
    if (!input.text && !input.mediaId) throw new ApiError("VALIDATION", "Напишите сообщение или добавьте фото");
    if (input.text && Array.from(input.text).length > 1000)
      throw new ApiError("MESSAGE_LIMIT", "Сообщение слишком длинное");
    const oldest = storage.sql
      .exec<{ created_at: number }>(
        `SELECT created_at FROM buyer_order_events WHERE order_number=? AND actor=? AND
        event IN ('chat.buyer','chat.seller') AND event=? AND created_at>? ORDER BY created_at DESC LIMIT 1 OFFSET 9`,
        number,
        actor.id,
        `chat.${actor.side}`,
        now - 60_000,
      )
      .toArray()[0];
    if (oldest)
      throw new ApiError("MESSAGE_LIMIT", "Слишком много сообщений. Попробуйте позже", {
        retryAfter: Math.ceil((oldest.created_at + 60_000 - now) / 1000),
      });

    if (input.mediaId) {
      const owner = actor.side === "seller" ? `seller:${actor.id}` : actor.id;
      if (
        !storage.sql.exec(
          `UPDATE media SET status='attached',expires_at=NULL WHERE id=? AND owner=? AND purpose='chat'
          AND status='temp' AND ready=1 AND expires_at>? AND mime='image/webp'`,
          input.mediaId,
          owner,
          now,
        ).rowsWritten
      )
        throw new ApiError("FORBIDDEN", "Фото недоступно");
    }
    const { id } = storage.sql
      .exec<{ id: number }>(
        "INSERT INTO buyer_order_events(order_number,actor,event,created_at,details) VALUES(?,?,?,?,?) RETURNING id",
        number,
        actor.id,
        `chat.${actor.side}`,
        now,
        JSON.stringify(input),
      )
      .one();
    const recipient = actor.side === "seller" && order.telegram && /^telegram:(\d+)$/u.exec(order.customer)?.[1];
    if (actor.side === "buyer" || recipient)
      storage.sql.exec(
        "INSERT INTO workday_notice(id,kind,order_number,recipient,expires_at) VALUES(?,'chat',?,?,?)",
        `chat:${id}`,
        number,
        recipient || null,
        now + 86_400_000,
      );
    env.changes.order(number);
    const entry: OrderChatEntry = { id, createdAt: now, kind: "message", side: actor.side, ...input };
    return { status: 200, body: entry };
  }).body;
}

export function markChatRead(env: Shop, actor: ChatActor, number: number, through: number) {
  const { storage } = env;
  const side = actor.side;
  const other = side === "buyer" ? "seller" : "buyer";
  return storage.transactionSync(() => {
    chatOrder(storage, number, actor);
    const row = storage.sql
      .exec<{ unread: number }>(
        `UPDATE order_chat SET ${side}_seen=MAX(${side}_seen,?),
        ${side}_unread=CASE WHEN ${side}_seen<? THEN
          (SELECT COUNT(*) FROM buyer_order_events WHERE order_number=? AND event IN ('chat.buyer','chat.seller')
            AND event=? AND id>?) ELSE ${side}_unread END
       WHERE order_number=? AND EXISTS(SELECT 1 FROM buyer_order_events WHERE order_number=? AND id=?)
       RETURNING ${side}_unread AS unread`,
        through,
        through,
        number,
        `chat.${other}`,
        through,
        number,
        number,
        through,
      )
      .toArray()[0];
    if (!row) throw new ApiError("VALIDATION", "Запись переписки недоступна");
    return row;
  });
}
