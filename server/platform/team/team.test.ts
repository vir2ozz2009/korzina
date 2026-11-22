import { env, exports } from "cloudflare:workers";
import { beforeAll, expect, it, vi } from "vitest";
import { type StaffInvite, staffPermissions } from "../../../src/shared/contracts/staff";
import { newToken, tokenHash } from "../../auth/tokens";
import { getAuth, postAuth, sellerFixture } from "../../testing/auth";
import { setupPlatform } from "../../testing/platform";
import { connectStaffChat, staffBotStatus } from "./bot";
import { createStaffInvite } from "./invitations";
import { changeNotification, staffNotificationSettings, staffRecipients } from "./notifications";
import { redeemStaffInvite } from "./redeem";
import { sendStaffTest } from "./test-message";

const shop = "korzina-demo-test2";
const endpoint = (path: string) => `/api/seller/team${path}?store=test2`;
const create = async (actor: string, now = Date.now()) =>
  createStaffInvite(
    env.PLATFORM,
    {
      ENCRYPTION_KEY: "ab".repeat(32),
      PLATFORM_BOT_TOKEN: "test",
      PLATFORM_BOT_USERNAME: "KorzinaDemoBot",
    },
    { actor, shop, command: { key: crypto.randomUUID(), fingerprint: "staff" }, now },
    { role: "picker" },
  );
const token = (invitation: StaffInvite) => new URL(invitation.url as string).searchParams.get("start")?.slice(6) ?? "";
const redeem = (invitation: StaffInvite, telegram: string, now = Date.now()) =>
  redeemStaffInvite(env.PLATFORM, { token: token(invitation), telegram, name: "Алина", now });

async function employeeSession(telegram: string) {
  const account = await env.PLATFORM.prepare("SELECT id FROM accounts WHERE telegram_id=?")
    .bind(telegram)
    .first<string>("id");
  const secret = newToken();
  await env.PLATFORM.prepare("INSERT INTO seller_sessions(token_hash,account_id,expires_at) VALUES(?,?,?)")
    .bind(await tokenHash(secret), account, Date.now() + 60_000)
    .run();
  return { account, Authorization: `Bearer ${secret}` };
}

beforeAll(setupPlatform);

it("§9.3 одноразовое приглашение связывает магазин и Telegram, отзыв и срок проверяются атомарно", async () => {
  const owner = await sellerFixture(shop);
  const invitation = await create(owner.accountId);
  expect(invitation.state).toBe("pending");
  expect(invitation.expiresAt - Date.now()).toBeGreaterThan(6 * 86_400_000);
  expect(
    await redeemStaffInvite(env.PLATFORM, {
      token: token(invitation),
      telegram: "10007",
      name: "Алина",
      now: Date.now(),
      channel: { shop, bot: "connected" },
    }),
  ).toEqual({ state: "invalid" });
  const [first, second] = await Promise.all([redeem(invitation, "10008"), redeem(invitation, "10009")]);
  expect([first.state, second.state].sort()).toEqual(["accepted", "used"]);
  const winner = first.state === "accepted" ? "10008" : "10009";
  expect(await redeem(invitation, winner, invitation.expiresAt + 1)).toEqual({ state: "accepted", shop });
  expect(await redeem(await create(owner.accountId), winner)).toEqual({ state: "member" });

  // Preserve the real token when advancing time. Expired invite details deliberately omit its URL.
  const short = await create(owner.accountId);
  expect(await redeem(short, "10010", short.expiresAt)).toEqual({ state: "expired" });
  const revoked = await create(owner.accountId);
  expect((await postAuth(endpoint(`/invites/${revoked.id}/revoke`), {}, owner.headers)).status).toBe(200);
  expect(await redeem(revoked, "10011")).toEqual({ state: "revoked" });
});

it("§9.4 и §11.1 роли ограничивают запросы и отзыв сразу блокирует обе сессии", async () => {
  const owner = await sellerFixture(shop);
  const invitation = await create(owner.accountId);
  await redeem(invitation, "10020");
  const first = await employeeSession("10020");
  const second = await employeeSession("10020");
  const headers = { Authorization: first.Authorization };
  expect((await getAuth("/api/seller/access/orders?shop=test2", headers)).status).toBe(200);
  expect((await getAuth("/api/seller/access/payments?shop=test2", headers)).status).toBe(403);
  expect((await getAuth("/api/seller/profile/data?store=test2", headers)).status).toBe(403);
  expect((await getAuth(endpoint("/members"), headers)).status).toBe(403);

  const update = (id: string | null, version: number, role: string) =>
    exports.default.fetch(
      new Request(`https://demo.korzina.app${endpoint(`/members/${id}`)}`, {
        method: "PUT",
        headers: { ...owner.headers, "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ version, access: { role } }),
      }),
    );
  expect((await update(first.account, 0, "owner")).status).toBe(400);
  expect((await update(owner.accountId, 0, "manager")).status).toBe(403);
  expect((await update(first.account, 0, "manager")).status).toBe(200);
  expect((await update(first.account, 0, "picker")).status).toBe(409);
  expect((await getAuth("/api/seller/access/payments?shop=test2", headers)).status).toBe(200);
  expect((await getAuth("/api/seller/profile/data?store=test2", headers)).status).toBe(200);
  expect((await getAuth(endpoint("/members"), headers)).status).toBe(403);
  expect((await getAuth(endpoint("/audit"), headers)).status).toBe(200);

  const revokePath = endpoint(`/members/${first.account}/revoke`);
  const key = { ...owner.headers, "Idempotency-Key": "revoke-twice" };
  expect((await postAuth(revokePath, { version: 1 }, key)).status).toBe(200);
  expect((await postAuth(revokePath, { version: 1 }, key)).status).toBe(200);
  expect((await getAuth("/api/seller/access/orders?shop=test2", headers)).status).toBe(403);
  expect((await getAuth("/api/seller/access/orders?shop=test2", { Authorization: second.Authorization })).status).toBe(
    403,
  );
  expect(await redeem(invitation, "10020")).toEqual({ state: "revoked" });
  const audit = await getAuth(`${endpoint("/audit")}&section=team`, owner.headers);
  const { entries } = await audit.json<{ entries: { action: string; change: unknown }[] }>();
  expect(entries.filter((row) => row.action === "team.access_revoked")).toHaveLength(1);
  expect(entries.find((row) => row.action === "team.access_updated")?.change).toMatchObject({
    before: { role: "picker" },
    after: { role: "manager", permissions: staffPermissions({ role: "manager" }) },
  });
  expect(JSON.stringify(entries)).not.toContain(token(invitation));
});

it("§11.3–§11.5 право, переключатель роли и текущий бот проверяются при отправке", async () => {
  const owner = await sellerFixture(shop);
  const invitation = await create(owner.accountId);
  await redeem(invitation, "10030");
  expect(await staffRecipients(env.PLATFORM, shop, "platform", "10030")).toEqual([]);
  await connectStaffChat(env.PLATFORM, shop, "platform", "10030");
  expect(await staffRecipients(env.PLATFORM, shop, "platform", "10030")).toEqual(["10030"]);
  expect(await staffRecipients(env.PLATFORM, shop, "next-bot", "10030")).toEqual([]);
  expect(
    (await staffNotificationSettings(env.PLATFORM, shop, "platform")).rows.find((row) => row.role === "picker"),
  ).toMatchObject({
    topics: [
      { topic: "newOrders", available: true, enabled: true },
      { topic: "paymentsAndReceipts", available: false, enabled: false },
      { topic: "cancellations", available: true, enabled: true },
      { topic: "lowStock", available: false, enabled: false },
    ],
  });
  const context = {
    actor: owner.accountId,
    shop,
    command: { key: crypto.randomUUID(), fingerprint: "switch" },
    now: Date.now(),
  };
  await changeNotification(env.PLATFORM, context, "platform", { role: "picker", topic: "newOrders", enabled: false });
  expect(await staffRecipients(env.PLATFORM, shop, "platform", "10030")).toEqual([]);
  expect((await staffBotStatus(env.PLATFORM, {}, shop, owner.accountId)).shopBot).toBeNull();
});

it("§9.1 тест отправляет одно личное сообщение выбранным ботом", async () => {
  const owner = await sellerFixture(shop);
  const invitation = await create(owner.accountId);
  await redeem(invitation, "10040");
  const staff = await employeeSession("10040");
  const secrets = { PLATFORM_BOT_TOKEN: "test", PLATFORM_BOT_USERNAME: "KorzinaDemoBot" };
  const context = {
    actor: owner.accountId,
    shop,
    command: { key: crypto.randomUUID(), fingerprint: "test" },
    now: Date.now(),
  };
  await expect(sendStaffTest(env.PLATFORM, secrets, context, staff.account ?? "")).rejects.toMatchObject({
    code: "BOT_NOT_STARTED",
  });
  await connectStaffChat(env.PLATFORM, shop, "platform", "10040");
  const send = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ ok: true, result: {} }));
  try {
    await expect(sendStaffTest(env.PLATFORM, secrets, context, staff.account ?? "")).resolves.toEqual({ sent: true });
    await expect(sendStaffTest(env.PLATFORM, secrets, context, staff.account ?? "")).resolves.toEqual({ sent: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBe("https://api.telegram.org/bottest/sendMessage");
    expect(JSON.parse(String(send.mock.calls[0][1]?.body))).toMatchObject({ chat_id: "10040" });
  } finally {
    send.mockRestore();
  }
});
