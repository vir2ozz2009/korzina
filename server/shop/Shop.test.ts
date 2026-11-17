import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { ShopContextCache } from "../platform/shop-context";
import { setupPlatform } from "../testing/platform";
import { migrations } from "./migrations";

beforeAll(setupPlatform);
// A fresh Worker isolate must read durable settings, including after DO eviction.
const info = (slug: string) =>
  new ShopContextCache().read(new Request(`https://demo.korzina.app/api/shop?shop=${slug}`), env);
const stub = (id: string) => exports.Shop.get(exports.Shop.idFromName(id));

describe("Shop SQLite", () => {
  it("автоматически мигрирует два магазина; запись в A не видна в B даже после перезапуска", async () => {
    await Promise.all([info("lavka"), info("test2")]);
    const a = stub("korzina-demo-lavka");
    const b = stub("korzina-demo-test2");
    await runInDurableObject(a, (_instance, ctx) => {
      ctx.storage.sql.exec("INSERT INTO settings (key,value) VALUES (?,?)", "display_name", "Только магазин A");
      expect(ctx.storage.sql.exec("SELECT count(*) AS count FROM __drizzle_migrations").one()).toEqual({
        count: migrations.journal.entries.length,
      });
    });
    expect(await info("lavka")).toMatchObject({ name: "Только магазин A" });
    expect(await info("test2")).toMatchObject({ name: "Второй магазин" });
    await runInDurableObject(b, (_instance, ctx) => {
      expect(ctx.storage.sql.exec("SELECT value FROM settings WHERE key='display_name'").toArray()).toEqual([]);
    });
    await evictDurableObject(a);
    expect(await info("lavka")).toMatchObject({ name: "Только магазин A" });
    await runInDurableObject(a, (_instance, ctx) => {
      expect(ctx.storage.sql.exec("SELECT count(*) AS count FROM __drizzle_migrations").one()).toEqual({
        count: migrations.journal.entries.length,
      });
    });
    expect(await info("test2")).toMatchObject({ name: "Второй магазин" });
  });

  it("не разрешает HTTP-запись настроек и не отдаёт закрытые таблицы или файлы", async () => {
    for (const path of ["/api/settings", "/api/invitations", "/api/files/private"]) {
      const response = await exports.default.fetch(new Request(`https://demo.korzina.app${path}?shop=test2`));
      expect(response.status).toBe(404);
    }
    const response = await exports.default.fetch(
      new Request("https://demo.korzina.app/api/shop?shop=test2", { method: "POST" }),
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: "NOT_FOUND", message: "Не найдено" } });
  });

  it("не принимает чужую идентичность даже при прямом внутреннем вызове", async () => {
    await info("lavka");
    const response = await stub("korzina-demo-lavka").fetch(
      new Request("https://internal/api/shop", {
        headers: { "x-korzina-shop": JSON.stringify({ id: "korzina-demo-test2", slug: "test2" }) },
      }),
    );
    expect(response.status).toBe(403);
  });
});
