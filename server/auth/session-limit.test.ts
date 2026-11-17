import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { handleError } from "../middleware/errors";
import { sessionLimiter } from "./session-limit";

describe("лимит подтверждённой сессии", () => {
  it("учитывает один аккаунт с разных IP и разделяет разные сессии", async () => {
    const limit = sessionLimiter(1);
    const app = new Hono().onError(handleError).get("/:actor", (c) => {
      // The route parameter stands in for an already verified server identity in this isolated middleware test.
      limit(c, c.req.param("actor"));
      return c.json({ ok: true });
    });
    expect((await app.request("/actor-a", { headers: { "CF-Connecting-IP": "192.0.2.1" } })).status).toBe(200);
    const repeated = await app.request("/actor-a", { headers: { "CF-Connecting-IP": "192.0.2.2" } });
    expect(repeated.status).toBe(429);
    expect(repeated.headers.get("Retry-After")).toBeTruthy();
    expect((await app.request("/actor-b")).status).toBe(200);
  });
});
