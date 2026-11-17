import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("Worker API", () => {
  it("возвращает состояние API как JSON", async () => {
    const response = await exports.default.fetch(new Request("https://demo.korzina.app/api/health"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ ok: true });
  });

  it("возвращает JSON 404 для неизвестного API, а не HTML витрины", async () => {
    const response = await exports.default.fetch(new Request("https://demo.korzina.app/api/missing"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: "NOT_FOUND", message: "Не найдено" } });
  });
});
