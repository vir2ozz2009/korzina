import { ApiError } from "../../../src/shared/errors";
import { digest, newToken } from "../../auth/tokens";
import type { ShopEnv } from "../../shop/env";
import { readCustomer } from "../auth/service";

type Shop = ShopEnv["Bindings"];
type Subscription = { subject: string; session: string };
const liveTag = "buyer-orders";
const accountTag = (subject: string) => `buyer-orders:${subject}`;

export async function buyerLiveTicket(env: Shop, request: Request) {
  const session = await readCustomer(env.db, request, env.shop.id);
  if (!session) throw new ApiError("UNAUTHORIZED", "Войдите в магазин");
  const ticket = newToken();
  env.storage.sql.exec("DELETE FROM seller_live_tickets WHERE expires_at<=?", Date.now());
  env.storage.sql.exec(
    "INSERT INTO seller_live_tickets(ticket,session_hash,expires_at) VALUES(?,?,?)",
    await digest(`buyer:${ticket}`),
    session.sessionId,
    Date.now() + 30_000,
  );
  return { ticket };
}

export async function upgradeBuyerOrders(env: Shop, request: Request) {
  const url = new URL(request.url);
  const ticket = url.searchParams.get("ticket");
  if (
    !ticket ||
    request.headers.get("Upgrade")?.toLowerCase() !== "websocket" ||
    request.headers.get("Origin") !== url.origin
  )
    throw new ApiError("FORBIDDEN", "Подключение недоступно");
  const account = env.storage.sql
    .exec<Subscription>(
      `DELETE FROM seller_live_tickets WHERE ticket=? AND expires_at>?
      AND EXISTS(SELECT 1 FROM sessions WHERE token_hash=session_hash AND expires_at>?)
      RETURNING session_hash AS session, (SELECT subject FROM sessions WHERE token_hash=session_hash) AS subject`,
      await digest(`buyer:${ticket}`),
      Date.now(),
      Date.now(),
    )
    .toArray()[0];
  if (!account) throw new ApiError("UNAUTHORIZED", "Подключение истекло");
  const { 0: client, 1: socket } = new WebSocketPair();
  const tag = accountTag(account.subject);
  env.object.acceptWebSocket(socket, [liveTag, tag]);
  socket.serializeAttachment(account);
  socket.send(JSON.stringify({ topic: "orders" }));
  return new Response(null, { status: 101, webSocket: client });
}

export function signalBuyerOrders(ctx: DurableObjectState, number: number) {
  if (!ctx.getWebSockets(liveTag).length) return;
  const row = ctx.storage.sql
    .exec<{ customer: string; version: number }>("SELECT customer,version FROM orders WHERE number=?", number)
    .toArray()[0];
  if (!row) return;
  for (const socket of ctx.getWebSockets(accountTag(row.customer))) {
    if (socket.readyState !== WebSocket.OPEN) continue;
    const { session, subject } = socket.deserializeAttachment() as Subscription;
    const [allowed] = ctx.storage.sql
      .exec("SELECT 1 FROM sessions WHERE token_hash=? AND subject=? AND expires_at>?", session, subject, Date.now())
      .toArray();
    if (!allowed) socket.close(1008, "Access expired");
    else socket.send(JSON.stringify({ topic: "orders", id: number, cursor: row.version }));
  }
}
