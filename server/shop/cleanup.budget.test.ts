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
    assertSqlBudget(metric.snapshot(), { sql: 7, rowsRead: 40, rowsWritten: 3 });
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

it("все виды просроченных данных и файлы убираются за несколько проходов по ≤7 SQL", async () => {
  await (await catalogRequest("live?ids=sku-01")).arrayBuffer();
  await runInDurableObject(catalogStub(), async (_instance, ctx) => {
    const now = Date.now();
    const sql = ctx.storage.sql;
    const past = now - 1;
    const future = now + day;
    const key = "korzina-demo-lavka/expired-media/original.pdf";
    await env.MEDIA.put(key, "expired");
    sql.exec("INSERT INTO idempotency VALUES('test','old','f','{}',?)", now - 2 * day);
    sql.exec("INSERT INTO sessions VALUES('expired','gone','guest',?),('active','here','guest',?)", past, future);
    sql.exec("INSERT INTO carts(customer,updated_at) VALUES('gone',?),('here',?)", now - 31 * day, now - 31 * day);
    sql.exec(
      "INSERT INTO receiving_seats VALUES('delivery','2026-11-18','',1,?),('delivery','2026-11-19','',1,?)",
      past,
      future,
    );
    sql.exec(
      "INSERT INTO customer_telegram_exchanges(id,owner,telegram_subject,expires_at) VALUES('old','gone',NULL,?),('fresh','here',NULL,?)",
      past,
      future,
    );
    sql.exec("INSERT INTO checkout_quotes VALUES('old','gone','{}',?),('fresh','here','{}',?)", past, future);
    sql.exec("INSERT INTO checkout_receipts VALUES('old','gone',0,'{}',?),('fresh','here',0,'{}',?)", past, future);
    sql.exec(
      `INSERT INTO media(id,owner,purpose,status,ready,bytes,mime,request_key,fingerprint,created_at,expires_at)
      VALUES('expired-media','gone','receipt','temp',1,7,'application/pdf','test','file',?,?)`,
      past,
      past,
    );
    sql.exec("INSERT INTO media_usage VALUES(1,7) ON CONFLICT(id) DO UPDATE SET bytes=bytes+7");

    for (const delay of [0, 1000, 2000]) {
      const metric = new RequestMetrics();
      await cleanupShop(metric.storage(ctx.storage), env, now + delay);
      assertSqlBudget(metric.snapshot(), { sql: 7 });
      if (delay < 2000) expect(await ctx.storage.getAlarm()).toBe(now + delay + 1000);
    }
    expect(await ctx.storage.getAlarm()).toBe(future);
    expect(await env.MEDIA.head(key)).toBeNull();
    expect(sql.exec("SELECT id FROM media WHERE id='expired-media'").toArray()).toEqual([]);
    expect(sql.exec("SELECT bytes FROM media_usage WHERE id=1").one()).toEqual(
      sql.exec("SELECT coalesce(sum(bytes),0) AS bytes FROM media").one(),
    );
    expect(sql.exec("SELECT key FROM idempotency").toArray()).toEqual([]);
    expect(sql.exec("SELECT token_hash FROM sessions").toArray()).toEqual([{ token_hash: "active" }]);
    expect(sql.exec("SELECT customer FROM carts").toArray()).toEqual([{ customer: "here" }]);
    expect(sql.exec("SELECT date FROM receiving_seats").toArray()).toEqual([{ date: "2026-11-19" }]);
    expect(sql.exec("SELECT id FROM customer_telegram_exchanges").toArray()).toEqual([{ id: "fresh" }]);
    expect(sql.exec("SELECT id FROM checkout_quotes").toArray()).toEqual([{ id: "fresh" }]);
    expect(sql.exec("SELECT media_id FROM checkout_receipts").toArray()).toEqual([{ media_id: "fresh" }]);
  });
});
