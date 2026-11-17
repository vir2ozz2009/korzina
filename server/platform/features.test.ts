import { env, exports } from "cloudflare:workers";
import { Hono } from "hono";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../src/shared/errors";
import type { FeatureState } from "../../src/shared/flags";
import { app } from "../index";
import { handleError } from "../middleware/errors";
import { requireFeature } from "../middleware/feature";
import { cookieFrom, getAuth, postAuth } from "../testing/auth";
import { setupPlatform } from "../testing/platform";
import { featureQuery, featureStatement, readFeatures } from "./features";

beforeAll(setupPlatform);
const get = (path: string, shop = "lavka", headers?: HeadersInit) =>
  app.fetch(new Request(`https://demo.korzina.app/api/${path}?shop=${shop}`, { headers }), env);
async function set(shop: string, enabled: boolean) {
  const { sql, params } = featureStatement(shop, "cashback", enabled);
  return env.PLATFORM.prepare(sql)
    .bind(...params)
    .run();
}

describe("флаги в D1 → Worker → Shop", () => {
  it("по умолчанию закрывает прямую ссылку, передаёт флаги вместе с shop; core доступен", async () => {
    for (const shop of ["lavka", "test2"]) {
      const response = await get("shop", shop);
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(await response.json()).toMatchObject({ features: { cashback: false } });
      const locked = await get("diagnostics/features/cashback", shop);
      expect(locked.status).toBe(403);
      expect(await locked.json()).toMatchObject({ error: { code: "FEATURE_DISABLED" } });
    }
  });

  it("on только для A; подмена заголовков не открывает B; off действует за 30 с без удаления данных", async () => {
    const guest = await postAuth("/api/auth/guest?shop=lavka");
    const cookie = cookieFrom(guest);
    const session = await guest.json();
    await set("lavka", true);
    vi.setSystemTime(Date.now() + 30_000);
    expect((await get("diagnostics/features/cashback")).status).toBe(200);
    expect(await (await get("shop")).json()).toMatchObject({ features: { cashback: true } });
    expect(
      (
        await get("diagnostics/features/cashback", "test2", {
          "x-korzina-features": JSON.stringify({ cashback: true }),
          "x-korzina-shop": JSON.stringify({ id: "korzina-demo-lavka" }),
        })
      ).status,
    ).toBe(403);
    expect(await (await get("shop", "test2")).json()).toMatchObject({ features: { cashback: false } });
    const before = await env.PLATFORM.prepare("SELECT name, status FROM shops WHERE slug = ?").bind("lavka").first();
    await set("lavka", false);
    vi.setSystemTime(Date.now() + 30_000);
    expect((await get("diagnostics/features/cashback")).status).toBe(403);
    expect(await (await get("shop")).json()).toMatchObject({ features: { cashback: false } });
    expect(await env.PLATFORM.prepare("SELECT name, status FROM shops WHERE slug = ?").bind("lavka").first()).toEqual(
      before,
    );
    expect(await (await getAuth("/api/auth/session?shop=lavka", { Cookie: cookie })).json()).toEqual(session);
    expect((await get("shop")).status).toBe(200);
    expect((await set("lavka", false)).meta.changes).toBe(0);
    vi.useRealTimers();
  });

  it("addon не выдаёт права; падение D1 не открывает функцию", async () => {
    await set("lavka", true);
    const guarded = new Hono<{ Bindings: { features: FeatureState } }>()
      .onError(handleError)
      .get("/", requireFeature("cashback"), () => {
        throw new ApiError("FORBIDDEN", "Нужны права");
      });
    const denied = await guarded.request(
      "https://internal/",
      {},
      {
        features: await readFeatures(env.PLATFORM, "korzina-demo-lavka"),
      },
    );
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
    await expect(readFeatures(env.PLATFORM, "missing")).resolves.toEqual({ cashback: false });
    const unavailable = vi.spyOn(env.PLATFORM, "withSession").mockImplementation(() => {
      throw new Error("unavailable");
    });
    try {
      await expect(readFeatures(env.PLATFORM, "korzina-demo-lavka")).rejects.toThrow("unavailable");
    } finally {
      unavailable.mockRestore();
    }
    await set("lavka", false);
  });

  it("нет публичной команды включения, probe закрыт на доменах магазинов", async () => {
    expect(
      (await exports.default.fetch(new Request("https://lavka.demo.korzina.app/api/diagnostics/features/cashback")))
        .status,
    ).toBe(404);
    expect((await get("platform/features")).status).toBe(404);
  });

  it("один индексный запрос на все флаги магазина, без записи и полного SCAN", async () => {
    const session = env.PLATFORM.withSession("first-primary");
    const primary = vi.spyOn(env.PLATFORM, "withSession").mockReturnValue(session);
    const queries = vi.spyOn(session, "prepare");
    try {
      expect(await readFeatures(env.PLATFORM, "korzina-demo-lavka")).toEqual({ cashback: false });
      expect(primary).toHaveBeenCalledExactlyOnceWith("first-primary");
      expect(queries).toHaveBeenCalledExactlyOnceWith(featureQuery);
    } finally {
      queries.mockRestore();
      primary.mockRestore();
    }
    const result = await env.PLATFORM.prepare(featureQuery).bind("korzina-demo-lavka").all();
    expect(result.meta.rows_written).toBe(0);
    expect(result.meta.rows_read).toBeLessThanOrEqual(2);
    const plan = await env.PLATFORM.prepare(`EXPLAIN QUERY PLAN ${featureQuery}`)
      .bind("korzina-demo-lavka")
      .all<{ detail: string }>();
    expect(plan.results.map((row) => row.detail).join(" ")).toMatch(/SEARCH.*shop_id/);
    expect(plan.results.map((row) => row.detail).join(" ")).not.toMatch(/SCAN/);
  });
});
