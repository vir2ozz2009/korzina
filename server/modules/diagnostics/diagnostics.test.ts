import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { setupPlatform } from "../../testing/platform";

beforeAll(setupPlatform);
const command = (key: string, value = "test", shop = "test2", extra: HeadersInit = {}) =>
  exports.default.fetch(
    new Request(`https://demo.korzina.app/api/diagnostics/echo?shop=${shop}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": key, ...extra },
      body: JSON.stringify({ value }),
    }),
  );

describe("контракты и идемпотентность через Worker → Shop", () => {
  it("сохраняет ответ при повторе, конкуренции и перезапуске DO", async () => {
    const key = crypto.randomUUID();
    const responses = await Promise.all(Array.from({ length: 5 }, () => command(key)));
    expect(responses.every((r) => r.status === 201)).toBe(true);
    const bodies = await Promise.all(responses.map((r) => r.json()));
    expect(bodies.every((body) => JSON.stringify(body) === JSON.stringify(bodies[0]))).toBe(true);
    const stub = env.SHOP.get(env.SHOP.idFromName("korzina-demo-test2"));
    await evictDurableObject(stub);
    expect(await (await command(key)).json()).toEqual(bodies[0]);
    expect(responses[0].headers.get("X-Request-Id")).not.toBe(responses[1].headers.get("X-Request-Id"));
    expect(responses[0].headers.get("x-korzina-sql")).toBeNull();
    expect(responses[0].headers.get("Cache-Control")).toBe("no-store");
  });
  it("другое тело с тем же ключом — конфликт; магазин B независим", async () => {
    const key = crypto.randomUUID();
    const a = await (await command(key, "one")).json();
    const conflict = await command(key, "two");
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ error: { code: "IDEMPOTENCY_CONFLICT" } });
    const b = await command(key, "two", "lavka");
    expect(b.status).toBe(201);
    expect(await b.json()).not.toEqual(a);
  });
  it("отклоняет пропущенный ключ, неверную схему, JSON, Origin и большое тело", async () => {
    for (const [body, headers, status, code] of [
      ['{"value":"x"}', {}, 400, "VALIDATION"],
      ['{"value":12}', { "Idempotency-Key": "schema" }, 400, "VALIDATION"],
      ["{", { "Idempotency-Key": "json" }, 400, "VALIDATION"],
      ['{"value":"x"}', { "Idempotency-Key": "origin", Origin: "https://evil.test" }, 403, "FORBIDDEN"],
      [JSON.stringify({ value: "x".repeat(5000) }), { "Idempotency-Key": "large" }, 413, "PAYLOAD_TOO_LARGE"],
    ] as const) {
      const response = await exports.default.fetch(
        new Request("https://demo.korzina.app/api/diagnostics/echo?shop=test2", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body,
        }),
      );
      expect(response.status).toBe(status);
      expect(await response.json()).toMatchObject({ error: { code } });
      expect(response.headers.get("X-Request-Id")).toMatch(/^[\da-f-]{36}$/);
    }
  });
  it("не сохраняет невалидную команду; следующий правильный запрос выполняется", async () => {
    const key = crypto.randomUUID();
    expect((await command(key, "x".repeat(201))).status).toBe(400);
    expect((await command(key, "valid")).status).toBe(201);
  });
  it("скрывает диагностические команды на домене магазина", async () => {
    const response = await exports.default.fetch(new Request("https://test2.korzina.app/api/diagnostics/revision"));
    expect(response.status).toBe(404);
  });
  it("миграция создаёт индекс для точечного поиска ключа", async () => {
    await command(crypto.randomUUID());
    await runInDurableObject(env.SHOP.get(env.SHOP.idFromName("korzina-demo-test2")), (_instance, ctx) => {
      const plan = ctx.storage.sql
        .exec("EXPLAIN QUERY PLAN SELECT response FROM idempotency WHERE scope = ? AND key = ?", "diagnostics", "key")
        .toArray();
      expect(JSON.stringify(plan)).toContain("SEARCH");
      expect(JSON.stringify(plan)).not.toContain("SCAN");
    });
  });
});
