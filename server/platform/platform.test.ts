import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { setupPlatform } from "../testing/platform";
import { prepareShop } from "./create-shop";
import { seedStatements } from "./seed";

beforeAll(setupPlatform);
const get = (url: string, headers?: HeadersInit) => exports.default.fetch(new Request(url, { headers }));

describe("разрешение магазина", () => {
  it("выбирает разные магазины по host; query не меняет магазин на домене магазина", async () => {
    const a = await (await get("https://lavka.demo.korzina.app/api/shop?shop=test2")).json();
    const b = await (await get("https://test2.demo.korzina.app/api/shop")).json();
    expect(a).toMatchObject({ id: "korzina-demo-lavka", slug: "lavka" });
    expect(b).toMatchObject({ id: "korzina-demo-test2", slug: "test2" });
  });

  it("разрешает переключение через query только на demo и localhost", async () => {
    for (const origin of ["http://localhost:5173", "https://demo.korzina.app"]) {
      expect(await (await get(`${origin}/api/shop?shop=test2`)).json()).toMatchObject({ slug: "test2" });
      expect(await (await get(`${origin}/api/shop`)).json()).toMatchObject({ slug: "lavka" });
    }
    expect((await get("https://unknown.test/api/shop?shop=lavka")).status).toBe(404);
  });

  it("отклоняет неизвестный slug и не доверяет подставленным заголовкам", async () => {
    expect((await get("https://demo.korzina.app/api/shop?shop=missing")).status).toBe(404);
    const response = await get("https://test2.demo.korzina.app/api/shop", {
      "x-korzina-shop": JSON.stringify({ id: "korzina-demo-lavka", slug: "lavka" }),
      "x-forwarded-host": "lavka.demo.korzina.app",
    });
    expect(await response.json()).toMatchObject({ slug: "test2" });
  });

  it("не отдаёт выключенный магазин", async () => {
    await env.PLATFORM.prepare(
      "INSERT INTO shops (id,slug,name,status,created_at) VALUES ('off','off','Закрыт','disabled',0)",
    ).run();
    expect((await get("https://demo.korzina.app/api/shop?shop=off")).status).toBe(404);
  });
});

describe("создание магазина", () => {
  it("создаёт магазин, домен и приглашение одной транзакцией; хранит только хеш токена", async () => {
    const result = await prepareShop("new-shop", "Новый'); DROP TABLE shops; --");
    await env.PLATFORM.batch(result.statements.map(({ sql, params }) => env.PLATFORM.prepare(sql).bind(...params)));
    const response = await get("https://demo.korzina.app/api/shop?shop=new-shop");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: result.shop.id, name: result.shop.name });
    expect(await (await get("https://new-shop.demo.korzina.app/api/shop")).json()).toMatchObject({
      id: result.shop.id,
    });
    const invitation = await env.PLATFORM.prepare("SELECT * FROM invitations WHERE shop_id = ?")
      .bind(result.shop.id)
      .first();
    expect(invitation).toMatchObject({ shop_id: result.shop.id, expires_at: result.expiresAt });
    const token = new URL(result.invitation).searchParams.get("token");
    expect(token).toHaveLength(43);
    expect(JSON.stringify(invitation)).not.toContain(token);
    expect(JSON.stringify(await (await get("https://demo.korzina.app/api/shop?shop=new-shop")).json())).not.toContain(
      "token",
    );
  });

  it("не создаёт частичный магазин при конфликте домена", async () => {
    await env.PLATFORM.prepare("INSERT INTO domains (host,shop_id) VALUES (?,?)")
      .bind("taken.demo.korzina.app", "korzina-demo-lavka")
      .run();
    const result = await prepareShop("taken", "Конфликт");
    await expect(
      env.PLATFORM.batch(result.statements.map(({ sql, params }) => env.PLATFORM.prepare(sql).bind(...params))),
    ).rejects.toThrow();
    expect(await env.PLATFORM.prepare("SELECT id FROM shops WHERE id = ?").bind(result.shop.id).first()).toBeNull();
    expect(
      await env.PLATFORM.prepare("SELECT shop_id FROM invitations WHERE shop_id = ?").bind(result.shop.id).first(),
    ).toBeNull();
  });

  it("повторный сид не меняет существующие магазины", async () => {
    await env.PLATFORM.batch(seedStatements.map(({ sql, params }) => env.PLATFORM.prepare(sql).bind(...params)));
    expect(
      await env.PLATFORM.prepare("SELECT count(*) AS count FROM shops WHERE slug IN (?,?)")
        .bind("lavka", "test2")
        .first(),
    ).toEqual({ count: 2 });
  });
});
