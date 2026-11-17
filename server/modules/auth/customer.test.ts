import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { cookieFrom, getAuth, postAuth } from "../../testing/auth";
import { setupPlatform } from "../../testing/platform";

beforeAll(setupPlatform);
describe("гостевые сессии покупателя", () => {
  it("выдаёт HttpOnly cookie; восстанавливает сессию после перезапуска; logout отзывает токен", async () => {
    const response = await postAuth("/api/auth/guest?shop=test2");
    expect(response.status).toBe(201);
    expect(response.headers.get("Set-Cookie")).toMatch(/HttpOnly; SameSite=Lax; Max-Age=2592000; Secure/);
    const cookie = cookieFrom(response);
    const session = await response.json();
    expect(session).toMatchObject({ kind: "guest" });
    expect(JSON.stringify(session)).not.toContain(cookie.split("=")[1]);
    const headers = { Cookie: cookie };
    expect(await (await getAuth("/api/auth/session?shop=test2", headers)).json()).toEqual(session);
    await evictDurableObject(env.SHOP.get(env.SHOP.idFromName("korzina-demo-test2")));
    expect(await (await getAuth("/api/auth/session?shop=test2", headers)).json()).toEqual(session);
    expect((await postAuth("/api/auth/guest?shop=test2", {}, headers)).status).toBe(200);
    const logout = await postAuth("/api/auth/logout?shop=test2", {}, headers);
    expect(logout.status).toBe(200);
    expect(logout.headers.get("Set-Cookie")).toContain("Max-Age=0");
    expect((await getAuth("/api/auth/session?shop=test2", headers)).status).toBe(401);
  });
  it("не принимает сессию магазина A в B и не доверяет подставленным идентификаторам", async () => {
    const response = await postAuth("/api/auth/guest?shop=test2");
    const token = cookieFrom(response).split("=")[1];
    expect(
      (
        await getAuth("/api/auth/session?shop=lavka", {
          Authorization: `Bearer ${token}`,
          "x-korzina-customer": "owner",
        })
      ).status,
    ).toBe(401);
    expect((await getAuth("/api/seller/access?shop=test2", { Authorization: `Bearer ${token}` })).status).toBe(401);
    expect(
      (await getAuth("/api/auth/session?shop=test2", { Authorization: "Bearer fake", Cookie: cookieFrom(response) }))
        .status,
    ).toBe(401);
  });
  it("истёкшая сессия отклоняется и в SQLite нет исходного токена", async () => {
    const response = await postAuth("/api/auth/guest?shop=lavka");
    const cookie = cookieFrom(response);
    const token = cookie.split("=")[1];
    await runInDurableObject(env.SHOP.get(env.SHOP.idFromName("korzina-demo-lavka")), (_instance, ctx) => {
      expect(JSON.stringify(ctx.storage.sql.exec("SELECT token_hash FROM sessions").toArray())).not.toContain(token);
      ctx.storage.sql.exec("UPDATE sessions SET expires_at = 0");
    });
    expect((await getAuth("/api/auth/session?shop=lavka", { Cookie: cookie })).status).toBe(401);
  });
  it("команды закрыты от cross-origin и неподключённого Telegram", async () => {
    expect((await postAuth("/api/auth/guest", {}, { Origin: "https://evil.test" })).status).toBe(403);
    expect((await postAuth("/api/auth/telegram", { initData: "forged" })).status).toBe(503);
  });
});
