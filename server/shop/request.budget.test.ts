import { exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { assertSqlBudget } from "../metrics";
import { setupPlatform } from "../testing/platform";

beforeAll(setupPlatform);

// Warmed requests include the Shop identity lookup. Migrations are initialization work.
describe("бюджет полного запроса Shop", () => {
  it("включает служебные чтения, не пишет при повторном GET и разделяет параллельные метрики", async () => {
    const id = "f3-request-budget";
    const stub = exports.Shop.get(exports.Shop.idFromName(id));
    const get = (requestId: string) =>
      stub.fetch(
        new Request("https://internal/api/shop", {
          headers: {
            "x-request-id": requestId,
            "x-korzina-shop": encodeURIComponent(
              JSON.stringify({ id, slug: "budget", name: "Budget", status: "active", plan: "base", createdAt: 0 }),
            ),
          },
        }),
      );
    await get("warmup");
    const responses = await Promise.all([get("one"), get("two")]);
    for (const [index, response] of responses.entries()) {
      expect(response.status).toBe(200);
      const metric = JSON.parse(response.headers.get("x-korzina-sql") ?? "null");
      expect(metric).toMatchObject({
        route: "/api/shop",
        shopId: id,
        requestId: index === 0 ? "one" : "two",
        sql: 2,
        rowsWritten: 0,
      });
      assertSqlBudget(metric, { sql: 2, rowsRead: 3, rowsWritten: 0 });
    }
  });
});
