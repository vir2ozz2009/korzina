import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { Hono } from "hono";
import { beforeAll, describe, expect, it } from "vitest";
import { ApiError } from "../../src/shared/errors";
import { handleError } from "../middleware/errors";
import { ShopContextCache } from "../platform/shop-context";
import { getAuth, postAuth, sellerFixture } from "../testing/auth";
import { setupPlatform } from "../testing/platform";
import { executeCommand } from "./commands";
import type { ShopEnv } from "./env";
import { migrations } from "./migrations";
import { handleShopRequest } from "./request";

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

  it("BL-12 новое действие заказа сигналит продавцу без правки Shop", async () => {
    const shop = await info("test2");
    const seller = await sellerFixture(shop.id);
    const ticketResponse = await postAuth("/api/seller/orders/live-ticket?store=test2", {}, seller.headers);
    expect(ticketResponse.status).toBe(200);
    const { ticket } = await ticketResponse.json<{ ticket: string }>();
    const upgrade = await getAuth(`/api/seller/orders/live?store=test2&ticket=${ticket}`, {
      Upgrade: "websocket",
      Origin: "https://demo.korzina.app",
    });
    expect(upgrade.status).toBe(101);
    const socket = upgrade.webSocket;
    if (!socket) throw new Error("Нет WebSocket продавца");
    const number = 42;
    const update = new Promise((resolve) => {
      socket.addEventListener("message", ({ data }) => {
        const message = JSON.parse(String(data));
        if (message.id === number) resolve(message);
      });
    });
    socket.accept();
    try {
      await runInDurableObject(stub(shop.id), async (_instance, ctx) => {
        const route = "/api/seller/orders/42/reschedule";
        const router = new Hono<ShopEnv>().onError(handleError).patch(route, (c) => {
          const result = executeCommand(
            c.env.storage,
            c.env.db,
            "BL-12",
            { key: "reschedule", fingerprint: "42" },
            () => {
              c.env.changes.order(number);
              if (c.req.query("fail")) throw new ApiError("VALIDATION", "Не удалось перенести");
              return { status: 200, body: { number } };
            },
          );
          return c.json(result.body);
        });
        const request = (query = "") =>
          handleShopRequest(
            new Request(`https://internal${route}${query}`, {
              method: "PATCH",
              headers: { "x-korzina-shop": encodeURIComponent(JSON.stringify(shop)) },
            }),
            ctx,
            env,
            router,
            { identity: shop.id },
            { expireSales() {}, orderPlaced() {}, async refreshSaleDeadline() {} },
          );
        await ctx.storage.deleteAlarm();
        expect((await request("?fail=1")).status).toBe(400);
        expect(await ctx.storage.getAlarm()).toBeNull();
        expect((await request()).status).toBe(200);
        expect(await ctx.storage.getAlarm()).toBeLessThanOrEqual(Date.now() + 1000);
        await ctx.storage.deleteAlarm();
        expect((await request()).status).toBe(200);
        expect(await ctx.storage.getAlarm()).toBeNull();
      });
      expect(await update).toMatchObject({ topic: "orders", id: number });
    } finally {
      socket.close();
    }
  });
});
