import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { cookieFrom, getAuth, postAuth } from "../../testing/auth";
import { setupPlatform } from "../../testing/platform";

beforeAll(setupPlatform);
const local = "http://localhost:5173";
async function login() {
  const start = await postAuth(
    "/api/platform/auth/email/start",
    { email: `${crypto.randomUUID()}@korzina.invalid` },
    {},
    local,
  );
  expect(start.status).toBe(201);
  const challenge = await start.json<{ challengeId: string; devCode: string }>();
  const verify = await postAuth(
    "/api/platform/auth/email/verify",
    { challengeId: challenge.challengeId, code: challenge.devCode },
    {},
    local,
  );
  expect(verify.status).toBe(200);
  const cookie = cookieFrom(verify);
  const session = await (await getAuth("/api/platform/auth/session", { Cookie: cookie }, local)).json<{
    accountId: string;
  }>();
  return { cookie, accountId: session.accountId, challenge };
}
async function grant(accountId: string, role = "employee", permissions = "[]") {
  await env.PLATFORM.prepare("INSERT INTO memberships (shop_id,account_id,role,permissions) VALUES (?,?,?,?)")
    .bind("korzina-demo-test2", accountId, role, permissions)
    .run();
}

describe("вход продавца и права", () => {
  it("одноразовый email-код входит в аккаунт без автоматической выдачи прав", async () => {
    const { cookie, accountId, challenge } = await login();
    expect(accountId).toBeTruthy();
    expect((await getAuth("/api/seller/access?shop=test2", { Cookie: cookie })).status).toBe(403);
    expect(
      (
        await postAuth(
          "/api/platform/auth/email/verify",
          { challengeId: challenge.challengeId, code: challenge.devCode },
          {},
          local,
        )
      ).status,
    ).toBe(401);
    const rows = await env.PLATFORM.prepare("SELECT token_hash FROM seller_sessions WHERE account_id = ?")
      .bind(accountId)
      .all();
    expect(JSON.stringify(rows.results)).not.toContain(cookie.split("=")[1]);
    await postAuth("/api/platform/auth/logout", {}, { Cookie: cookie });
    expect((await getAuth("/api/platform/auth/session", { Cookie: cookie })).status).toBe(401);
  });
  it("сотрудник имеет базовые права; деньги и команда требуют отдельных прав", async () => {
    const { cookie, accountId } = await login();
    await grant(accountId);
    const headers = { Cookie: cookie, "x-korzina-role": "owner", "x-korzina-account": accountId };
    expect((await getAuth("/api/seller/access/orders?shop=test2", headers)).status).toBe(200);
    expect((await getAuth("/api/seller/access/payments?shop=test2", headers)).status).toBe(403);
    expect((await getAuth("/api/seller/access/team?shop=test2", headers)).status).toBe(403);
    expect((await getAuth("/api/seller/access/orders?shop=lavka", headers)).status).toBe(403);
    await env.PLATFORM.prepare("UPDATE memberships SET permissions = ? WHERE shop_id = ? AND account_id = ?")
      .bind('["payments"]', "korzina-demo-test2", accountId)
      .run();
    expect((await getAuth("/api/seller/access/payments?shop=test2", headers)).status).toBe(200);
    await env.PLATFORM.prepare("UPDATE memberships SET permissions = '[]' WHERE shop_id = ? AND account_id = ?")
      .bind("korzina-demo-test2", accountId)
      .run();
    expect((await getAuth("/api/seller/access/payments?shop=test2", headers)).status).toBe(403);
    await env.PLATFORM.prepare("UPDATE memberships SET revoked_at = ? WHERE shop_id = ? AND account_id = ?")
      .bind(Date.now(), "korzina-demo-test2", accountId)
      .run();
    expect((await getAuth("/api/seller/access/orders?shop=test2", headers)).status).toBe(403);
  });
  it("владелец имеет все права только в своём магазине; истёкшая сессия не работает", async () => {
    const { cookie, accountId } = await login();
    await grant(accountId, "owner");
    expect((await getAuth("/api/seller/access/team?shop=test2", { Cookie: cookie })).status).toBe(200);
    expect((await getAuth("/api/seller/access/payments?shop=test2", { Cookie: cookie })).status).toBe(200);
    expect((await getAuth("/api/seller/access/team?shop=lavka", { Cookie: cookie })).status).toBe(403);
    await env.PLATFORM.prepare("UPDATE seller_sessions SET expires_at = 0 WHERE account_id = ?").bind(accountId).run();
    expect((await getAuth("/api/seller/access/team?shop=test2", { Cookie: cookie })).status).toBe(401);
  });
  it("проверка прав идёт по индексам сессии и магазина", async () => {
    const plan = await env.PLATFORM.prepare(
      "EXPLAIN QUERY PLAN SELECT s.account_id, m.role FROM seller_sessions s LEFT JOIN memberships m ON m.account_id = s.account_id AND m.shop_id = ? AND m.revoked_at IS NULL WHERE s.token_hash = ? AND s.expires_at > ?",
    )
      .bind("korzina-demo-test2", "hash", Date.now())
      .all();
    expect(JSON.stringify(plan.results)).not.toContain("SCAN");
    expect(JSON.stringify(plan.results)).toContain("SEARCH");
  });
  it("не раскрывает dev-код на demo и не пускает без сессии", async () => {
    const response = await postAuth("/api/platform/auth/email/start", { email: "test@korzina.invalid" });
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("devCode");
    expect((await getAuth("/api/seller/access?shop=test2")).status).toBe(401);
    expect((await postAuth("/api/platform/auth/telegram", { initData: "forged" })).status).toBe(503);
  });
});
