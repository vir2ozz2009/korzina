import { runInDurableObject } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { describe, expect, it, vi } from "vitest";
import { assertSqlBudget, RequestMetrics } from "./metrics";
import { executeCommand } from "./shop/commands";
import { settings } from "./shop/schema";

const run = (name: string, test: (ctx: DurableObjectState) => void) =>
  runInDurableObject(exports.Shop.get(exports.Shop.idFromName(name)), (_instance, ctx) => test(ctx));

describe("SQL бюджеты: шаблон для горячих путей", () => {
  it("считает SQL и реальные строки Drizzle; бюджет падает при лишнем запросе", async () => {
    await run("f3-budget", (ctx) => {
      const metrics = new RequestMetrics();
      const db = drizzle(metrics.storage(ctx.storage));
      db.insert(settings).values({ key: "budget", value: "not logged" }).run();
      const rows = db.select({ value: settings.value }).from(settings).where(eq(settings.key, "budget")).all();
      expect(rows).toHaveLength(1);
      const actual = metrics.snapshot();
      expect(actual).toMatchObject({ sql: 2 });
      expect(actual.rowsRead).toBeGreaterThanOrEqual(1);
      expect(actual.rowsWritten).toBeGreaterThanOrEqual(1);
      assertSqlBudget(actual, { sql: 2, rowsRead: 4, rowsWritten: 4 });
      expect(() => assertSqlBudget(actual, { sql: 1 })).toThrow("SQL budget exceeded");
      expect(() => assertSqlBudget(actual, { rowsRead: 0 })).toThrow("rowsRead");
      expect(() => assertSqlBudget(actual, { rowsWritten: 0 })).toThrow("rowsWritten");
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      const metric = metrics.record("/api/example", "f3-budget", "request-1", 200, true);
      expect(metric.handlerMs).toBeGreaterThanOrEqual(0);
      expect(log).toHaveBeenCalledOnce();
      expect(JSON.stringify(metric)).not.toContain("not logged");
      log.mockRestore();
    });
  });
  it("повтор команды читает одну строку одним запросом без записей", async () => {
    await run("f3-repeat-budget", (ctx) => {
      const identity = { key: "key", fingerprint: "body" };
      const db = drizzle(ctx.storage);
      const result = executeCommand(ctx.storage, db, "actor", identity, () => ({
        body: { ok: true },
        status: 202,
        headers: { "X-Result": "saved" },
      }));
      const metrics = new RequestMetrics();
      const measured = metrics.storage(ctx.storage);
      const replay = executeCommand(measured, drizzle(measured), "actor", identity, () => {
        throw new Error("Must not execute");
      });
      expect(replay).toEqual(result);
      expect(metrics.snapshot().sql).toBe(1);
      assertSqlBudget(metrics.snapshot(), { sql: 1, rowsRead: 2, rowsWritten: 0 });
      const otherActor = executeCommand(ctx.storage, db, "actor-b", identity, () => ({
        body: { different: true },
        status: 200,
      }));
      expect(otherActor).not.toEqual(result);
    });
  });
  it("ошибка откатывает бизнес-запись и не занимает ключ", async () => {
    await run("f3-rollback", (ctx) => {
      const db = drizzle(ctx.storage);
      const identity = { key: "retry", fingerprint: "body" };
      expect(() =>
        executeCommand(ctx.storage, db, "actor", identity, () => {
          db.insert(settings).values({ key: "must-rollback", value: "secret" }).run();
          throw new Error("fail");
        }),
      ).toThrow("fail");
      expect(db.select().from(settings).where(eq(settings.key, "must-rollback")).get()).toBeUndefined();
      expect(
        executeCommand(ctx.storage, db, "actor", identity, () => ({ body: { retried: true }, status: 200 })).body,
      ).toEqual({ retried: true });
    });
  });
});
