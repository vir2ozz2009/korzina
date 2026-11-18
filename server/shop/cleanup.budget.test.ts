import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeAll, expect, it } from "vitest";
import { assertSqlBudget, RequestMetrics } from "../metrics";
import { catalogRequest, catalogStub } from "../modules/catalog/testing";
import { setupPlatform } from "../testing/platform";
import { day } from "./cleanup";
import { cleanupShop } from "./maintenance";

beforeAll(setupPlatform);
it("аларм сохраняет свежие ключи, активные сессии и их корзины; SQL ограничен, без работы аларма нет", async () => {
  await (await catalogRequest("live?ids=sku-01")).arrayBuffer();
  await runInDurableObject(catalogStub(), async (_instance, ctx) => {
    const now = Date.now();
    const sql = ctx.storage.sql;
    for (const [key, time] of [
      ["old", now - 2 * day],
      ["fresh", now],
    ] as const)
      sql.exec("INSERT INTO idempotency VALUES('test',?,'f','{}',?)", key, time);
    sql.exec("INSERT INTO sessions VALUES('expired','gone','guest',?),('active','here','guest',?)", now - 1, now + day);
    for (const [subject, time] of [
      ["gone", now - 31 * day],
      ["here", now - 31 * day],
      ["recent", now],
    ] as const)
      sql.exec("INSERT INTO carts(customer,updated_at) VALUES(?,?)", subject, time);
    const metric = new RequestMetrics();
    await cleanupShop(metric.storage(ctx.storage), env, now);
    // Capacity counters and Telegram exchanges each add one bounded index deletion.
    assertSqlBudget(metric.snapshot(), { sql: 8, rowsRead: 35, rowsWritten: 3 });
    expect(sql.exec("SELECT key FROM idempotency").toArray()).toEqual([{ key: "fresh" }]);
    expect(sql.exec("SELECT token_hash FROM sessions").toArray()).toEqual([{ token_hash: "active" }]);
    expect(sql.exec("SELECT customer FROM carts ORDER BY customer").toArray()).toEqual([
      { customer: "here" },
      { customer: "recent" },
    ]);
    expect(await ctx.storage.getAlarm()).toBeGreaterThan(now);
    sql.exec("DELETE FROM idempotency");
    sql.exec("DELETE FROM sessions");
    sql.exec("DELETE FROM carts");
    await cleanupShop(ctx.storage, env, now);
    expect(await ctx.storage.getAlarm()).toBeNull();
  });
});
it("большая очередь удаляется пачкой, оставшаяся работа получает быстрый следующий аларм", async () => {
  await (await catalogRequest("live?ids=sku-01")).arrayBuffer();
  await runInDurableObject(catalogStub(), async (_instance, ctx) => {
    const now = Date.now();
    ctx.storage.sql.exec(
      `INSERT INTO idempotency(scope,key,fingerprint,response,created_at)
      WITH RECURSIVE ids(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM ids WHERE n<101) SELECT 'batch',CAST(n AS TEXT),'f','{}',? FROM ids`,
      now - 2 * day,
    );
    await cleanupShop(ctx.storage, env, now);
    expect(ctx.storage.sql.exec("SELECT count(*) AS n FROM idempotency WHERE scope='batch'").one()).toEqual({ n: 1 });
    expect(await ctx.storage.getAlarm()).toBe(now + 1000);
  });
});
