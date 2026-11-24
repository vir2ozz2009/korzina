import { ApiError } from "../../../src/shared/errors";
import { credential, sellerCookie } from "../../auth/cookies";
import { readSellerSession, type Seller } from "../../auth/roles";
import { newToken, tokenHash } from "../../auth/tokens";
import type { ShopEnv } from "../../shop/env";
import { orderListRevision } from "./list";

type Shop = ShopEnv["Bindings"];
type Subscription = { session: string; shop: string };
const liveTag = "seller-orders";
function liveTopic(seller: Seller) {
  if (seller.role === "owner" || seller.permissions.includes("orders")) return "orders";
  if (seller.permissions.includes("payments")) return "sales";
  throw new ApiError("FORBIDDEN", "Доступ ограничен");
}

export async function sellerLiveTicket(env: Shop, request: Request) {
  const token = credential(request, sellerCookie);
  if (!token) throw new ApiError("UNAUTHORIZED", "Войдите в кабинет");
  const ticket = newToken();
  env.storage.sql.exec("DELETE FROM seller_live_tickets WHERE expires_at<=?", Date.now());
  env.storage.sql.exec(
    "INSERT INTO seller_live_tickets(ticket,session_hash,expires_at) VALUES(?,?,?)",
    await tokenHash(ticket),
    await tokenHash(token),
    Date.now() + 30_000,
  );
  return { ticket };
}

export async function upgradeSellerOrders(ctx: DurableObjectState, env: Shop, request: Request) {
  const ticket = new URL(request.url).searchParams.get("ticket");
  if (
    request.headers.get("Upgrade")?.toLowerCase() !== "websocket" ||
    request.headers.get("Origin") !== new URL(request.url).origin
  )
    throw new ApiError("FORBIDDEN", "Подключение недоступно");
  if (!ticket) throw new ApiError("UNAUTHORIZED", "Войдите в кабинет");
  const row = env.storage.sql
    .exec<{ session_hash: string }>(
      "DELETE FROM seller_live_tickets WHERE ticket=? AND expires_at>? RETURNING session_hash",
      await tokenHash(ticket),
      Date.now(),
    )
    .toArray()[0];
  if (!row) throw new ApiError("UNAUTHORIZED", "Подключение истекло");
  const seller = await readSellerSession(env.platform, row.session_hash, env.shop.id);
  const topic = liveTopic(seller);
  const account = `seller:${seller.accountId}`;
  const { 0: client, 1: socket } = new WebSocketPair();
  for (const old of ctx.getWebSockets(account))
    if (old.readyState === WebSocket.OPEN) old.close(1000, "New connection");
  ctx.acceptWebSocket(socket, [liveTag, account]);
  socket.serializeAttachment({ session: row.session_hash, shop: env.shop.id } satisfies Subscription);
  socket.send(JSON.stringify(topic === "orders" ? { topic, cursor: orderListRevision(env.storage) } : { topic }));
  return new Response(null, { status: 101, webSocket: client });
}

export async function signalSellerOrders(ctx: DurableObjectState, database: D1Database, number: number) {
  const sockets = ctx.getWebSockets(liveTag).filter((socket) => socket.readyState === WebSocket.OPEN);
  if (!sockets.length) return;
  const data = JSON.stringify({ topic: "orders", id: number, cursor: orderListRevision(ctx.storage) });
  await Promise.all(
    sockets.map(async (socket) => {
      try {
        const { session, shop } = socket.deserializeAttachment() as Subscription;
        const topic = liveTopic(await readSellerSession(database, session, shop));
        if (socket.readyState === WebSocket.OPEN) socket.send(topic === "orders" ? data : JSON.stringify({ topic }));
      } catch {
        if (socket.readyState === WebSocket.OPEN) socket.close(1008, "Access expired");
      }
    }),
  );
}
