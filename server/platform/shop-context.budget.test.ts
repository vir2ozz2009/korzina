import { runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { setupPlatform } from "../testing/platform";
import { featureStatement } from "./features";
import { ShopContextCache } from "./shop-context";

beforeAll(setupPlatform);
const request = (shop: string) => new Request(`https://demo.korzina.app/api/shop?shop=${shop}`);

describe("контекст магазина, изоляция и бюджет платформы", () => {
  it("повтор в пределах 30 с: 0 D1; on/off и тема обновляются к границе TTL, B изолирован", async () => {
    let now = Date.now();
    const cache = new ShopContextCache(() => now);
    const initial = await cache.read(request("lavka"), env);
    expect(initial.features.cashback).toBe(false);
    const queries = vi.spyOn(env.PLATFORM, "prepare");
    const sessions = vi.spyOn(env.PLATFORM, "withSession");
    try {
      now += 29_999;
      expect(await cache.read(request("lavka"), env)).toEqual(initial);
      expect(queries).not.toHaveBeenCalled();
      expect(sessions).not.toHaveBeenCalled();
    } finally {
      queries.mockRestore();
      sessions.mockRestore();
    }
    const set = featureStatement("lavka", "cashback", true);
    await env.PLATFORM.prepare(set.sql)
      .bind(...set.params)
      .run();
    await runInDurableObject(exports.Shop.get(exports.Shop.idFromName(initial.id)), (_instance, ctx) => {
      ctx.storage.sql.exec(
        "INSERT INTO settings(key,value) VALUES ('theme',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        JSON.stringify({ custom: "#f8c537" }),
      );
      ctx.storage.sql.exec(
        "UPDATE settings SET value=json_set(value,'$.timeZone','America/Los_Angeles') WHERE key='receiving_schedule'",
      );
    });
    expect((await cache.read(request("lavka"), env)).theme).toEqual(initial.theme);
    now += 1;
    const enabled = await cache.read(request("lavka"), env);
    expect(enabled).toMatchObject({
      features: { cashback: true },
      theme: { custom: "#f8c537" },
      timeZone: "America/Los_Angeles",
    });
    expect(await cache.read(request("test2"), env)).toMatchObject({
      features: { cashback: false },
      theme: { preset: "raspberry" },
      timeZone: "Asia/Ho_Chi_Minh",
    });
    const off = featureStatement("lavka", "cashback", false);
    await env.PLATFORM.prepare(off.sql)
      .bind(...off.params)
      .run();
    now += 30_000;
    expect((await cache.read(request("lavka"), env)).features.cashback).toBe(false);
  });

  it("после TTL сбой D1 не возвращает устаревший разрешающий контекст; повтор восстанавливается", async () => {
    let now = Date.now();
    const cache = new ShopContextCache(() => now);
    await cache.read(request("test2"), env);
    now += 30_000;
    const failure = vi.spyOn(env.PLATFORM, "withSession").mockImplementation(() => {
      throw new Error("unavailable");
    });
    try {
      await expect(cache.read(request("test2"), env)).rejects.toThrow("unavailable");
    } finally {
      failure.mockRestore();
    }
    expect((await cache.read(request("test2"), env)).features.cashback).toBe(false);
  });
});
