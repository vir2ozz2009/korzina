import { env } from "cloudflare:workers";
import { beforeAll, expect, it } from "vitest";
import { app } from "../../index";
import { customerTtl } from "../../modules/auth/service";
import { setupPlatform } from "../../testing/platform";
import { openAdminSession } from "./access";
import { invitationToken } from "./invitation-link";

beforeAll(setupPlatform);
const telegramId = "90011";
const accountId = "admin-fixture";
const signingKey = "bc".repeat(32);
const bindings = { ...env, PLATFORM_ADMIN_TELEGRAM_IDS: telegramId, ENCRYPTION_KEY: signingKey };
const endpoint = "/api/platform/admin/shops";

async function grant() {
  await env.PLATFORM.batch([
    env.PLATFORM.prepare("INSERT INTO accounts(id,telegram_id) VALUES(?,?) ON CONFLICT(id) DO NOTHING").bind(
      accountId,
      telegramId,
    ),
    env.PLATFORM.prepare("INSERT INTO platform_admins(account_id) VALUES(?) ON CONFLICT(account_id) DO NOTHING").bind(
      accountId,
    ),
  ]);
  return openAdminSession(env.PLATFORM, bindings, telegramId, Date.now() + customerTtl * 1000);
}

function request(path: string, options?: { token?: string; key?: string; body?: object; allowlist?: string }) {
  return app.fetch(
    new Request(`https://demo.korzina.app${path}`, {
      method: options?.body ? "POST" : "GET",
      headers: {
        ...(options?.token && { Cookie: `korzina_admin=${options.token}` }),
        ...(options?.body && {
          "Content-Type": "application/json",
          "Idempotency-Key": options?.key ?? crypto.randomUUID(),
        }),
      },
      ...(options?.body && { body: JSON.stringify(options.body) }),
    }),
    { ...bindings, PLATFORM_ADMIN_TELEGRAM_IDS: options?.allowlist ?? telegramId },
  );
}

it("§9.6 · §9.12 D15 проверяет роль и allowlist на каждом запросе и ограничивает доступ 12 часами", async () => {
  const { token, ttl } = await grant();
  expect(ttl).toBeLessThanOrEqual(12 * 60 * 60);
  expect((await request(endpoint)).status).toBe(403);
  expect((await request(endpoint, { token, allowlist: "90013" })).status).toBe(403);
  expect((await request(endpoint, { token })).status).toBe(200);
  await expect(
    openAdminSession(env.PLATFORM, bindings, telegramId, Date.now() + (customerTtl - 13 * 3600) * 1000),
  ).rejects.toMatchObject({ code: "AUTH_FAILED" });
  await expect(
    openAdminSession(
      env.PLATFORM,
      { ...bindings, PLATFORM_ADMIN_TELEGRAM_IDS: "90013" },
      telegramId,
      Date.now() + customerTtl * 1000,
    ),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await env.PLATFORM.prepare("UPDATE admin_sessions SET expires_at=0 WHERE account_id=?").bind(accountId).run();
  expect((await request(endpoint, { token })).status).toBe(401);
});

it("§9.5 · §9.7 · §9.10 · §9.12 черновик получает регион и одно приглашение при повторе", async () => {
  const { token } = await grant();
  const input = { name: "Тёплый хлеб", slug: "tyoplyy-khleb", country: "VN" };
  const command = { token, body: input, key: "same-command" };
  const simultaneous = await Promise.all([request(endpoint, command), request(endpoint, command)]);
  expect(simultaneous.map(({ status }) => status)).toEqual([201, 201]);
  const results = await Promise.all(simultaneous.map((response) => response.json<{ id: string }>()));
  const { id } = results[0];
  expect(results[1].id).toBe(id);
  expect(await (await request(`${endpoint}/${id}`, { token })).json()).toMatchObject({
    id,
    name: input.name,
    status: "draft",
    country: "VN",
    currency: "VND",
    timeZone: "Asia/Ho_Chi_Minh",
  });
  const invites = await env.PLATFORM.prepare("SELECT token_hash,link_id FROM invitations WHERE shop_id=?")
    .bind(id)
    .all<{ token_hash: string; link_id: string }>();
  expect(invites.results).toHaveLength(1);
  expect(invites.results[0].token_hash).not.toBe(await invitationToken(invites.results[0].link_id, signingKey));
  const audits = await env.PLATFORM.prepare("SELECT count(*) AS count FROM platform_audit WHERE shop_id=?")
    .bind(id)
    .first();
  expect(audits).toMatchObject({ count: 1 });
  expect((await request(endpoint, { ...command, body: { ...input, name: "Изменение" } })).status).toBe(409);
  expect((await request(endpoint, { token, body: { ...input, slug: "korzina-example" } })).status).toBe(409);
  expect((await request(endpoint, { token, body: input })).status).toBe(409);
});

it("§4.4 · §9.12 сбой записи события откатывает черновик, адрес и приглашение", async () => {
  const { token } = await grant();
  await env.PLATFORM.prepare(`CREATE TRIGGER fail_audit BEFORE INSERT ON platform_audit
    BEGIN SELECT RAISE(ABORT, 'fixture audit failure'); END`).run();
  try {
    const response = await request(endpoint, { token, body: { name: "Откат", slug: "audit-fail", country: "VN" } });
    expect(response.status).toBe(500);
    expect(await env.PLATFORM.prepare("SELECT id FROM shops WHERE slug='audit-fail'").first()).toBeNull();
    expect(
      await env.PLATFORM.prepare("SELECT host FROM domains WHERE host='audit-fail.demo.korzina.app'").first(),
    ).toBeNull();
  } finally {
    await env.PLATFORM.prepare("DROP TRIGGER fail_audit").run();
  }
});
