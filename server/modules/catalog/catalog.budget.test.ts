import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../../index";
import { assertSqlBudget, RequestMetrics } from "../../metrics";
import * as forwarding from "../../shop/forward";
import { setupPlatform } from "../../testing/platform";
import { cachedDocument } from "./cache";
import { brandsSql, categoriesSql } from "./navigation";
import { documentQuery, liveQuery, photosSql, productSql } from "./queries";
import { catalogRequest, catalogSql, catalogStub, resetCatalog } from "./testing";

beforeAll(setupPlatform);
beforeEach(resetCatalog);

describe("бюджеты каталога", () => {
  it("публичный документ той же версии: 0 вызовов DO, ETag/304; цена и остаток всегда свежие и no-store", async () => {
    const request = new Request("https://demo.korzina.app/api/catalog/document");
    const load = vi.fn(() => catalogRequest("document"));
    const input = { limit: 50 };
    const first = await cachedDocument(request, input, "budget", "a", load);
    const etag = first.headers.get("ETag") as string;
    const version = Number(first.headers.get("X-Catalog-Version"));
    const legacy = await cachedDocument(
      new Request(request, { headers: { "If-None-Match": `"catalog-${version}-${encodeURIComponent("limit=50")}"` } }),
      { ...input, version },
      "budget",
      "a",
      load,
    );
    expect(legacy.status).toBe(200);
    expect(legacy.headers.get("ETag")).not.toBe(`"catalog-${version}-${encodeURIComponent("limit=50")}"`);
    await legacy.arrayBuffer();
    load.mockClear();
    const conditional = await cachedDocument(
      new Request(request, { headers: { "If-None-Match": `W/${etag}` } }),
      { ...input, version },
      "budget",
      "a",
      load,
    );
    expect(conditional.status).toBe(304);
    expect(load).not.toHaveBeenCalled();
    const publicBody = await first.json();
    await catalogSql("UPDATE variants SET stock=0,price_minor=55555 WHERE id='sku-01'");
    const stillPublic = await cachedDocument(request, input, "budget", "a", load);
    expect(await stillPublic.json()).toEqual(publicBody);
    expect(load).not.toHaveBeenCalled();
    const live = await catalogRequest("live?ids=sku-01");
    expect(live.headers.get("Cache-Control")).toBe("no-store");
    expect(await live.json()).toMatchObject({ items: [{ priceMinor: 55555, stock: 0, available: false }] });
    await cachedDocument(request, input, "budget", "b", load);
    expect(load).toHaveBeenCalledTimes(1);
    await catalogSql("UPDATE products SET name='Новое название' WHERE id='product-01'");
    const liveAfterEdit = await (await catalogRequest("live?ids=sku-01")).json<{ catalogVersion: number }>();
    expect(liveAfterEdit.catalogVersion).toBeGreaterThan(version);
    const changed = await cachedDocument(
      new Request(request, { headers: { "If-None-Match": etag } }),
      { ...input, version: liveAfterEdit.catalogVersion },
      "budget",
      "a",
      load,
    );
    expect(changed.status).toBe(200);
    expect(changed.headers.get("ETag")).not.toBe(etag);
    load.mockClear();
    await cachedDocument(request, input, "preview", "a", load);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("неизменная версия категории: один вызов DO за offers, 0 чтений таблиц описаний", async () => {
    const url = "https://demo.korzina.app/api/catalog/page?shop=lavka&scope=category:home";
    const warm = await app.request(url, {}, env);
    expect(warm.status).toBe(200);
    const before = await warm.json<Awaited<ReturnType<typeof import("./page").readPage>>>();
    await catalogSql("UPDATE variants SET price_minor=65432,stock=1 WHERE id='sku-01'");
    const forward = vi.spyOn(forwarding, "forwardToShop");
    const statements: string[] = [];
    const storageReader = RequestMetrics.prototype.storage;
    const storage = vi.spyOn(RequestMetrics.prototype, "storage").mockImplementation(function (
      this: RequestMetrics,
      input,
    ) {
      const measured = storageReader.call(this, input);
      const sql = new Proxy(measured.sql, {
        get: (target, key) =>
          key === "exec"
            ? (query: string, ...bindings: SqlStorageValue[]) => {
                statements.push(query);
                return target.exec(query, ...bindings);
              }
            : Reflect.get(target, key, target),
      });
      return new Proxy(measured, { get: (target, key) => (key === "sql" ? sql : Reflect.get(target, key, target)) });
    });
    try {
      for (const endpoint of [url, `${url}&version=${before.catalogVersion}`]) {
        forward.mockClear();
        statements.length = 0;
        const response = await app.request(endpoint, {}, env);
        expect(response.status).toBe(200);
        expect(response.headers.get("Cache-Control")).toBe("no-store");
        const after = await response.json<typeof before>();
        expect(after.catalogVersion).toBe(before.catalogVersion);
        expect(after.items).toEqual(before.items);
        expect(after.offers.items.find((item) => item.id === "sku-01")).toMatchObject({ priceMinor: 65432, stock: 1 });
        expect(forward).toHaveBeenCalledTimes(1);
        const request = forward.mock.calls[0][0].req.raw;
        expect(new URL(request.url).pathname).toBe("/api/catalog/page-offers");
        expect(new URL(request.url).searchParams.get("ids")?.split(",")).toEqual(
          before.items.flatMap((item) => item.variants.map((v) => v.id)),
        );
        expect(statements).toHaveLength(2);
        expect(statements.join("\n")).not.toMatch(/\b(products|categories|brands|media|product_photos)\b/i);
        expect(statements.join("\n")).toMatch(/FROM variants/);
        expect(statements.join("\n")).toMatch(/FROM catalog_state/);
      }
    } finally {
      forward.mockRestore();
      storage.mockRestore();
    }
  });

  it("оперативная страница ≤2 SQL и ≤2 строк на SKU, полная карточка ≤3 SQL — через полный маршрут Shop", async () => {
    const ids = Array.from({ length: 24 }, (_, i) => `sku-${String(i + 1).padStart(2, "0")}`);
    await (await catalogRequest(`live?ids=${ids}`)).arrayBuffer();
    const response = await catalogRequest(`live?ids=${ids}`);
    const body = await response.json<{ items: object[] }>();
    const metric = JSON.parse(response.headers.get("x-korzina-sql") as string);
    assertSqlBudget(metric, { sql: 2, rowsRead: 2 * body.items.length, rowsWritten: 0 });
    for (const ids of [
      "sku-01",
      Array.from({ length: 50 }, (_, i) => `sku-${String(i + 1).padStart(2, "0")}`).join(","),
      "missing",
    ]) {
      const response = await catalogRequest(`live?ids=${ids}`);
      const body = await response.json<{ items: object[] }>();
      assertSqlBudget(JSON.parse(response.headers.get("x-korzina-sql") as string), {
        sql: 2,
        rowsRead: body.items.length ? 2 * body.items.length : 1,
        rowsWritten: 0,
      });
    }
    const product = await catalogRequest("products/product-01");
    expect(product.status).toBe(200);
    assertSqlBudget(JSON.parse(product.headers.get("x-korzina-sql") as string), { sql: 3, rowsWritten: 0 });
  });

  it("страница категории/бренда ≤4 SQL документа + ≤2 SQL live, без записей", async () => {
    for (const filter of ["category=home", "brand=brand-1"]) {
      const document = await catalogRequest(`document?limit=16&${filter}`);
      const body = await document.json<{ items: { variants: { id: string }[] }[] }>();
      assertSqlBudget(JSON.parse(document.headers.get("x-korzina-sql") as string), { sql: 4, rowsWritten: 0 });
      const ids = body.items.flatMap((item) => item.variants.map((variant) => variant.id));
      expect(ids.length).toBeGreaterThan(0);
      const live = await catalogRequest(`live?ids=${ids.join(",")}`);
      assertSqlBudget(JSON.parse(live.headers.get("x-korzina-sql") as string), {
        sql: 2,
        rowsRead: 2 * ids.length,
        rowsWritten: 0,
      });
    }
  });

  it("единый endpoint страницы категории/бренда: ≤6 SQL, без записей", async () => {
    for (const scope of ["all", "category:home", "brand:brand-1"]) {
      const response = await catalogRequest(`page?scope=${scope}`);
      expect(response.status).toBe(200);
      assertSqlBudget(JSON.parse(response.headers.get("x-korzina-sql") as string), { sql: 6, rowsWritten: 0 });
    }
  });

  it("планы всех запросов товара, категории, бренда, фасовок и фото используют индексы больших таблиц", async () => {
    await catalogSql("SELECT version FROM catalog_state WHERE id=1");
    await runInDurableObject(catalogStub(), (_instance, ctx) => {
      const pages = [{ limit: 50 }, { limit: 50, category: "milk" }, { limit: 50, brand: "brand-1" }].map(
        documentQuery,
      );
      const statements = [
        ...pages,
        { sql: categoriesSql, params: [] },
        { sql: brandsSql, params: [] },
        liveQuery(["sku-01", "sku-02"]),
        { sql: productSql, params: ["product-01"] },
        { sql: photosSql, params: ["product-01"] },
      ];
      for (const query of statements) {
        const plan = ctx.storage.sql
          .exec<{ detail: string }>(`EXPLAIN QUERY PLAN ${query.sql}`, ...query.params)
          .toArray();
        expect(plan.map((p) => p.detail).join("\n")).not.toMatch(/SCAN (?:p|v|variants|products|pp|product_photos)\b/);
      }
    });
  });
});
