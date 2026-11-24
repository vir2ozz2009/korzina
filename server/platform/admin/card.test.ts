import { runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { app } from "../../index";
import { publishPlatformOrders } from "../../shop/order-projection";
import { postAuth } from "../../testing/auth";
import { setupPlatform } from "../../testing/platform";
import { invitationToken } from "./invitation-link";
import { redeemOwnerInvite } from "./owner-invite";
import { createDraft } from "./registry";
import { changeShopBot } from "./shop-bot";
import { changeShop, type ShopMutation } from "./shop-change";
import { managedShop } from "./shop-detail";

beforeAll(setupPlatform);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const db = env.PLATFORM;
const actor = "admin-test";
const origin = "https://demo.korzina.app";
const bindings = {
  ...env,
  ENCRYPTION_KEY: "bc".repeat(32),
};
const command = () => ({ key: crypto.randomUUID(), fingerprint: crypto.randomUUID() });
async function mutation(id: string): Promise<ShopMutation> {
  return { id, actor, command: command(), version: (await managedShop(db, id)).version };
}
async function draft(slug: string) {
  return (await createDraft(db, bindings, actor, command(), { name: "Тёплый хлеб", slug, country: "VN" })).id;
}
const token = "92222:kotlinstorefixturetelegram";
function mockTelegram() {
  const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname !== "api.telegram.org") throw new Error("Unexpected HTTP request");
    if (init?.signal?.aborted) throw init.signal.reason;
    return Response.json({
      ok: true,
      result: url.pathname.endsWith("/getMe") ? { id: 92222, username: "KorzinaStoreFixtureBot", is_bot: true } : true,
    });
  });
  vi.stubGlobal("fetch", request);
  return request;
}

async function newestInvite(id: string) {
  const row = await db
    .prepare("SELECT link_id AS id FROM invitations WHERE shop_id=? AND revoked_at IS NULL")
    .bind(id)
    .first<{ id: string }>();
  if (!row) throw new Error("Expected an invitation");
  return invitationToken(row.id, bindings.ENCRYPTION_KEY);
}

it("§9.11 · §9.12 после таймаута getMe подключение сохраняет прежнюю ссылку, а погашение назначает одного владельца", async () => {
  const id = await draft("tg-first");
  const original = await newestInvite(id);
  const telegram = mockTelegram();
  const step = await mutation(id);
  const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValueOnce(AbortSignal.abort());
  await changeShopBot(db, bindings, step, { action: "connect", version: step.version, token }, origin);
  expect(timeout.mock.calls.slice(0, 2)).toEqual([[15_000], [5000]]);
  const methods = telegram.mock.calls.map(([url]) => new URL(String(url)).pathname.split("/").at(-1));
  expect(methods).toEqual(["getMe", "getMe", "setWebhook", "setChatMenuButton"]);
  const encrypted = await db.prepare("SELECT token FROM shop_bots WHERE shop_id=?").bind(id).first();
  expect(JSON.stringify(encrypted)).not.toContain(token);
  const secondId = await draft("tg-conflict");
  const second = await mutation(secondId);
  await expect(
    changeShopBot(db, bindings, second, { action: "connect", version: second.version, token }, origin),
  ).rejects.toMatchObject({ code: "BOT_IN_USE" });
  await expect(
    changeShopBot(db, bindings, second, { action: "connect", version: second.version, token: "invalid" }, origin),
  ).rejects.toMatchObject({ code: "TOKEN_INVALID" });
  const update = {
    message: { chat: { id: 92224, type: "private" }, from: { id: 92224 }, text: `/start inv_${original}` },
  };
  expect((await postAuth(`/api/platform/shop-telegram/${id}`, update)).status).toBe(403);
  expect((await redeemOwnerInvite(db, original, "92225", "Анна", secondId)).state).toBe("invalid");
  const outcomes = await Promise.all([
    redeemOwnerInvite(db, original, "92224", "Ирина", id),
    redeemOwnerInvite(db, original, "92225", "Анна", id),
  ]);
  expect(outcomes.map((outcome) => outcome.state).sort()).toEqual(["accepted", "used"]);
  const winner = outcomes[0].state === "accepted" ? "92224" : "92225";
  expect((await redeemOwnerInvite(db, original, winner, "", id)).state).toBe("accepted");
  expect(
    await db
      .prepare("SELECT COUNT(*) AS count FROM platform_audit WHERE shop_id=? AND action='owner.invite_redeemed'")
      .bind(id)
      .first(),
  ).toMatchObject({ count: 1 });
});

it("§9.2 · §9.5 · §9.12 владелец меняется при принятии с причиной и прежняя ссылка отзывается", async () => {
  const id = await draft("tg-replace");
  const original = await newestInvite(id);
  expect((await redeemOwnerInvite(db, original, "92231", "Анна", id)).state).toBe("accepted");
  const request = await mutation(id);
  await changeShop(
    db,
    request,
    { action: "invite", version: request.version, reason: "Передача магазина" },
    bindings,
    false,
  );
  expect((await managedShop(db, id)).ownerName).toBe("Анна");
  expect((await redeemOwnerInvite(db, original, "92231", "Анна", id)).state).toBe("invalid");
  const next = await newestInvite(id);
  const result = await redeemOwnerInvite(db, next, "92232", "Ирина", id);
  expect(result).toMatchObject({ state: "accepted", previousOwner: "92231" });
  expect((await managedShop(db, id)).ownerName).toBe("Ирина");
  expect(
    await db
      .prepare("SELECT COUNT(*) AS count FROM memberships WHERE shop_id=? AND revoked_at IS NULL AND role='owner'")
      .bind(id)
      .first(),
  ).toMatchObject({ count: 1 });
  const webhook = await app.fetch(
    new Request(`${origin}/api/platform/shop-telegram/${id}`, {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": "wrong secret", "Content-Type": "application/json" },
      body: JSON.stringify({
        message: { text: `/start inv_${next}`, chat: { id: 92233, type: "private" }, from: { id: 92233 } },
      }),
    }),
    bindings,
  );
  expect(webhook.status).toBe(403);
});

it("§9.12 пауза, возобновление и дополнение меняют только выбранный магазин с контролем версии", async () => {
  const id = await draft("tg-status");
  const other = await draft("tg-status-other");
  const first = await mutation(id);
  await expect(
    changeShop(db, first, { action: "status", version: first.version, status: "paused" }, bindings, false),
  ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  await changeShop(db, first, { action: "status", version: first.version, status: "active" }, bindings, false);
  const second = await mutation(id);
  await changeShop(db, second, { action: "status", version: second.version, status: "paused" }, bindings, false);
  expect((await managedShop(db, id)).status).toBe("paused");
  await expect(
    changeShop(
      db,
      { ...second, command: command() },
      { action: "status", version: second.version, status: "active" },
      bindings,
      false,
    ),
  ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  const next = await mutation(id);
  await changeShop(db, next, { action: "status", version: next.version, status: "active" }, bindings, false);
  const flag = await mutation(id);
  await changeShop(
    db,
    flag,
    { action: "feature", version: flag.version, key: "cashback", enabled: true },
    bindings,
    false,
  );
  expect((await managedShop(db, id)).status).toBe("active");
  expect((await managedShop(db, other)).status).toBe("draft");
  expect((await db.prepare("SELECT shop_id AS id FROM feature_overrides WHERE key='cashback'").all()).results).toEqual([
    { id },
  ]);
});

it("§9.12 заказы проецируются из журнала магазина в агрегаты без дублей", async () => {
  const id = await draft("order-summary");
  const stub = exports.Shop.get(exports.Shop.idFromName(id));
  await runInDurableObject(stub, async (_instance, { storage }) => {
    const at = Date.now();
    storage.sql.exec("INSERT INTO settings(key,value) VALUES('shop_id',?)", id);
    const { number } = storage.sql
      .exec<{ number: number }>(
        `INSERT INTO orders(customer,created_at,status,payment_status,snapshot)
      VALUES('guest:fixture',?,'placed','unpaid','{}') RETURNING number`,
        at,
      )
      .one();
    storage.sql.exec("INSERT INTO order_outbox(order_number,event,created_at) VALUES(?,'order.placed',?)", number, at);
    await publishPlatformOrders(storage, db);
    storage.sql.exec("DELETE FROM settings WHERE key='platform_order_watermark'");
    await publishPlatformOrders(storage, db);
  });
  const row = await db.prepare("SELECT COUNT(*) AS count FROM platform_order_events WHERE shop_id=?").bind(id).first();
  expect(row).toMatchObject({ count: 1 });
});

it("§11.1 блокирует смену валюты после первого неоплаченного заказа", async () => {
  const id = await draft("currency-after-first-order");
  const stub = exports.Shop.get(exports.Shop.idFromName(id));
  await runInDurableObject(stub, (_instance, { storage }) => {
    storage.sql.exec(
      "INSERT INTO orders(customer,created_at,status,payment_status,snapshot) VALUES('guest:fixture',?,'placed','unpaid','{}')",
      Date.now(),
    );
  });
  const { hasOrders } = await stub.adminShopStats();
  expect(hasOrders).toBe(true);
  const step = await mutation(id);
  await expect(
    changeShop(
      db,
      step,
      {
        action: "data",
        version: step.version,
        name: "Хлеб",
        country: "VN",
        currency: "USD",
        timeZone: "Asia/Ho_Chi_Minh",
        theme: { preset: "forest" },
      },
      bindings,
      hasOrders,
    ),
  ).rejects.toMatchObject({ code: "CURRENCY_LOCKED" });
});
