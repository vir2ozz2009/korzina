import { exports } from "cloudflare:workers";
import { hc } from "hono/client";
import { beforeAll, describe, expect, it } from "vitest";
import type { AppType } from "./index";
import { setupPlatform } from "./testing/platform";

beforeAll(setupPlatform);
const client = hc<AppType>("https://demo.korzina.app", {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => exports.default.fetch(new Request(input, init)),
});
describe("Hono RPC", () => {
  it("выводит контракт тела и ответа из DO-маршрута", async () => {
    const response = await client.api.diagnostics.echo.$post(
      { json: { value: "typed" } },
      { headers: { "Idempotency-Key": crypto.randomUUID() } },
    );
    expect(response.status).toBe(201);
    const result = await response.json();
    const value: string = result.value;
    expect(value).toBe("typed");
    expect(result.operationId).toMatch(/^[\da-f-]{36}$/);
  });
});
