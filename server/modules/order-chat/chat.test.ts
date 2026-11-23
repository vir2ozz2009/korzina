import { beforeAll, expect, it } from "vitest";
import type { OrderChatHistory, OrderChatList } from "../../../src/shared/contracts/order-chat";
import { customerCookie } from "../../auth/cookies";
import { newToken, tokenHash } from "../../auth/tokens";
import { assertSqlBudget, type SqlMetrics } from "../../metrics";
import { getAuth, postAuth, sellerFixture } from "../../testing/auth";
import { snapshot } from "../../testing/orders";
import { setupPlatform } from "../../testing/platform";
import { catalogSql, shopRequest } from "../catalog/testing";

const shop = "korzina-demo-lavka";
beforeAll(setupPlatform);
let sequence = 123_000;

async function buyerSession() {
  const token = newToken();
  const subject = `telegram:${++sequence}`;
  await catalogSql(
    "INSERT INTO sessions(token_hash,subject,kind,expires_at) VALUES(?,?,'telegram',?)",
    await tokenHash(token),
    subject,
    Date.now() + 86_400_000,
  );
  return { subject, headers: { Cookie: `${customerCookie(shop)}=${token}` } };
}

async function fixture(stage = "accepted", createdAt = Date.now()) {
  const buyer = await buyerSession();
  const seller = await sellerFixture(shop);
  const [{ number }] = await catalogSql(
    "INSERT INTO orders(customer,created_at,status,payment_status,snapshot) VALUES(?,?,?,'unpaid',?) RETURNING number",
    buyer.subject,
    createdAt,
    stage,
    JSON.stringify({ ...snapshot, telegramLinked: true }),
  );
  const path = `/api/orders/chat/${number}?shop=lavka`;
  const sellerPath = `/api/seller/chat/${number}?store=lavka`;
  return { number, buyer, seller, path, sellerPath };
}

it("D21 и US-Z06 · доступ только своему заказу, повтор записывает сообщение и уведомление один раз", async () => {
  const { buyer, seller, number, path, sellerPath } = await fixture();
  const live = await postAuth("/api/orders/live-ticket?shop=lavka", {}, buyer.headers);
  expect(live.status).toBe(200);
  expect(await live.json()).toMatchObject({ ticket: expect.stringMatching(/^[a-f0-9]{64}$/u) });
  const stranger = await buyerSession();
  expect((await getAuth(path, stranger.headers)).status).toBe(403);
  expect((await getAuth(path)).status).toBe(401);
  expect((await postAuth("/api/orders/chat/999999?shop=lavka", { text: "Есть вопрос" }, buyer.headers)).status).toBe(
    403,
  );

  const data = { text: "Есть вопрос" };
  const headers = { ...buyer.headers, "Idempotency-Key": crypto.randomUUID() };
  const first = await postAuth(path, data, headers);
  expect(first.status).toBe(200);
  const message = await first.json();
  expect(await (await postAuth(path, data, headers)).json()).toEqual(message);
  const history = await (await getAuth(sellerPath, seller.headers)).json<OrderChatHistory>();
  expect(history.entries).toEqual([message]);
  expect(await catalogSql("SELECT kind FROM workday_notice WHERE kind='chat' AND order_number=?", number)).toEqual([
    { kind: "chat" },
  ]);
});

it("US-R10 · отметка чтения не поглощает новое сообщение", async () => {
  const { buyer, seller, number, path } = await fixture();
  const first = await (await postAuth(path, { text: "Первое" }, buyer.headers)).json<{ id: number }>();
  const second = await (await postAuth(path, { text: "Второе" }, buyer.headers)).json<{ id: number }>();
  const read = (through: number) =>
    postAuth(`/api/seller/chat/${number}/read?store=lavka`, { through }, seller.headers);
  expect(await (await read(first.id)).json()).toMatchObject({ unread: 1 });
  const list = await (await getAuth("/api/seller/chat?store=lavka", seller.headers)).json<OrderChatList>();
  expect(list.chats[0]).toMatchObject({ number, preview: "Второе", unread: 1, waiting: true });
  const badge = () => shopRequest("seller/chat/badge", seller.headers);
  const unread = await badge();
  expect(await unread.json()).toMatchObject({ count: expect.any(Number) });
  assertSqlBudget(JSON.parse(unread.headers.get("x-korzina-sql") ?? "{}") as SqlMetrics, { sql: 1, rowsRead: 1 });
  const beforeBadge = await (await badge()).json<{ count: number }>();
  expect(await (await read(second.id)).json()).toMatchObject({ unread: 0 });
  expect(await (await badge()).json()).toEqual({ count: beforeBadge.count - 1 });
  const history = await shopRequest(`orders/chat/${number}`, buyer.headers);
  expect(history.status).toBe(200);
  assertSqlBudget(JSON.parse(history.headers.get("x-korzina-sql") ?? "{}") as SqlMetrics, { sql: 3, rowsRead: 25 });
  await history.arrayBuffer();
  expect(await (await read(first.id)).json()).toMatchObject({ unread: 0 });
});

it("§9.12, §11.7 · чужое фото запрещено, лимит считает символы", async () => {
  const { buyer, path } = await fixture();
  const photo = crypto.randomUUID();
  const stranger = await buyerSession();
  await catalogSql(
    `INSERT INTO media(id,owner,purpose,status,ready,bytes,mime,request_key,fingerprint,created_at,expires_at)
     VALUES(?,?,'chat','temp',1,24,'image/webp',?,'image',?,?)`,
    photo,
    stranger.subject,
    photo,
    Date.now(),
    Date.now() + 60_000,
  );
  expect((await postAuth(path, { mediaId: photo }, buyer.headers)).status).toBe(403);
  expect((await postAuth(path, { text: "😀".repeat(1001) }, buyer.headers)).status).toBe(429);
  expect((await postAuth(path, { text: "😀".repeat(1000) }, buyer.headers)).status).toBe(200);
});

it("O8.3 · через 7 дней переписка открывается только на чтение", async () => {
  const { buyer, seller, number, path, sellerPath } = await fixture("completed", Date.now() - 7 * 86_400_000);
  await catalogSql(
    "INSERT INTO buyer_order_events(order_number,actor,event,created_at,details) VALUES(?,?,'chat.seller',?,?)",
    number,
    seller.accountId,
    Date.now() - 8 * 86_400_000,
    JSON.stringify({ text: "Передано" }),
  );
  expect(await (await postAuth(path, { text: "Вопрос" }, buyer.headers)).json()).toMatchObject({
    error: { code: "CHAT_CLOSED" },
  });
  for (const [url, headers] of [
    [path, buyer.headers],
    [sellerPath, seller.headers],
  ] as const) {
    expect(await (await getAuth(url, headers)).json()).toMatchObject({
      writable: false,
      entries: [{ text: "Передано" }],
    });
  }
});
