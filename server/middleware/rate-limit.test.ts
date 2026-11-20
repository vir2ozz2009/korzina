import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { handleError } from "./errors";
import { apiRateLimit, RateLimiter, rateLimit } from "./rate-limit";

describe("лимит запросов", () => {
  it("разделяет клиентов и восстанавливается по часам", () => {
    const limit = new RateLimiter(2, 1000);
    expect(limit.consume("a", 0)).toBe(0);
    expect(limit.consume("a", 1)).toBe(0);
    expect(limit.consume("a", 2)).toBe(1);
    expect(limit.consume("b", 2)).toBe(0);
    expect(limit.consume("a", 1000)).toBe(0);
  });
  it("возвращает 429 в общем формате и Retry-After", async () => {
    const app = new Hono()
      .onError(handleError)
      .use(
        "*",
        rateLimit(new RateLimiter(1), () => "client"),
      )
      .get("/", (c) => c.json({ ok: true }));
    expect((await app.request("/")).status).toBe(200);
    const response = await app.request("/");
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(await response.json()).toMatchObject({ error: { code: "RATE_LIMITED" } });
  });
  it.each([
    { APP_ENV: "production", LOCAL_E2E: "1", limit: 120 },
    { APP_ENV: "demo", LOCAL_E2E: "0", limit: 120 },
    { APP_ENV: "preview", LOCAL_E2E: "0", limit: 240 },
    { APP_ENV: "demo", LOCAL_E2E: "1", limit: 240 },
  ] as const)("BL-8 · $APP_ENV (LOCAL_E2E=$LOCAL_E2E) ограничивает API после $limit запросов", async (testCase) => {
    const { APP_ENV, LOCAL_E2E, limit } = testCase;
    const bindings = { APP_ENV, LOCAL_E2E };
    const app = new Hono<{ Bindings: typeof bindings }>()
      .onError(handleError)
      .use("*", apiRateLimit)
      .get("/", (c) => c.body(null, 204));
    const headers = { "CF-Connecting-IP": `test-client-${APP_ENV}-${LOCAL_E2E}` };
    for (let count = 0; count < limit; count++) {
      expect((await app.request("/", { headers }, bindings)).status).toBe(204);
    }
    const response = await app.request("/", { headers }, bindings);
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ error: { code: "RATE_LIMITED" } });
  });
  it("не выдаёт внутреннюю ошибку клиенту", async () => {
    const app = new Hono().onError(handleError).get("/", () => {
      throw new Error("SECRET");
    });
    const response = await app.request("/");
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("SECRET");
  });
});
