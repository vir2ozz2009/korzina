import { env } from "cloudflare:workers";
import { beforeAll, expect, it, vi } from "vitest";
import * as cleanup from "../cleanup";
import { shopStatements } from "../create-shop";
import platform from "../migrations/0000_platform.sql?raw";
import auth from "../migrations/0001_awesome_hedge_knight.sql?raw";
import registry from "../migrations/0007_admin_registry.sql?raw";
import adminCard from "../migrations/0008_admin_card.sql?raw";
import { changeShop } from "./shop-change";
import { managedShop } from "./shop-detail";

const database = env.PLATFORM;
const bindings = { APP_ENV: "demo" } as const;
const actor = "address-test";
const id = crypto.randomUUID();
const command = () => ({ key: crypto.randomUUID(), fingerprint: crypto.randomUUID() });

beforeAll(async () => {
  const migrations = [platform, auth, registry, adminCard].flatMap((sql) => sql.split("--> statement-breakpoint"));
  const draft = shopStatements(
    { id, slug: "draft-cheese", name: "Сыр", createdAt: 0 },
    "draft",
    "draft-cheese.demo.korzina.app",
  );
  await database.batch([
    ...migrations.map((sql) => database.prepare(sql)),
    ...draft.map(({ sql, params }) => database.prepare(sql).bind(...params)),
    database.prepare("INSERT INTO shops (id,slug,name,created_at) VALUES ('occupied-shop','test2','Занят',0)"),
    database.prepare(`CREATE TRIGGER fail_address_audit BEFORE INSERT ON platform_audit WHEN new.action='shop.data'
    BEGIN SELECT RAISE(ABORT,'audit failure fixture'); END`),
  ]);
  // Address commands still run against real D1. The retention alarm is covered by cleanup.test.ts.
  const scheduler = vi.spyOn(cleanup, "scheduleSellerCleanup").mockResolvedValue(undefined);
  return () => {
    scheduler.mockRestore();
  };
});

it("§9.7 · §9.10 · §9.12 адрес меняется только у черновика и атомарно записывается в журнал", async () => {
  const data = {
    action: "data" as const,
    name: "Сыр",
    country: "VN",
    currency: "VND",
    timeZone: "Asia/Ho_Chi_Minh",
    theme: { preset: "raspberry" },
    version: 0,
  };
  await expect(
    changeShop(database, { id, actor, command: command(), version: 0 }, { ...data, slug: "support" }, bindings, false),
  ).rejects.toMatchObject({ code: "SLUG_RESERVED" });
  await expect(
    changeShop(database, { id, actor, command: command(), version: 0 }, { ...data, slug: "test2" }, bindings, false),
  ).rejects.toMatchObject({ code: "SLUG_TAKEN" });
  await expect(
    changeShop(
      database,
      { id, actor, command: command(), version: 0 },
      { ...data, slug: "fresh-cheese" },
      bindings,
      false,
    ),
  ).rejects.toThrow("audit failure fixture");
  expect((await managedShop(database, id)).slug).toBe("draft-cheese");
  const domains = database.prepare("SELECT host FROM domains WHERE shop_id=?").bind(id);
  const [before] = await database.batch([domains, database.prepare("DROP TRIGGER fail_address_audit")]);
  expect(before.results[0]).toMatchObject({ host: "draft-cheese.demo.korzina.app" });
  const renamed = { id, actor, command: command(), version: 0 };
  const result = await changeShop(database, renamed, { ...data, slug: "fresh-cheese" }, bindings, false);
  expect(await changeShop(database, renamed, { ...data, slug: "fresh-cheese" }, bindings, false)).toEqual(result);
  expect(result.version).toBe(1);
  const [after, audit] = await database.batch<{ changed: string }>([
    domains,
    database.prepare("SELECT changed FROM platform_audit WHERE shop_id=? AND action='shop.data'").bind(id),
  ]);
  expect(after).toMatchObject({
    results: [{ host: "fresh-cheese.demo.korzina.app" }],
  });
  expect(JSON.parse(audit.results[0]?.changed ?? "{}")).toMatchObject({
    from: { slug: "draft-cheese" },
    to: { slug: "fresh-cheese" },
  });
  await changeShop(
    database,
    { id, actor, command: command(), version: 1 },
    { action: "status", status: "active", version: 1 },
    bindings,
    false,
  );
  await expect(
    changeShop(
      database,
      { id, actor, command: command(), version: 2 },
      { ...data, version: 2, slug: "other-cheese" },
      bindings,
      false,
    ),
  ).rejects.toMatchObject({ code: "SLUG_LOCKED" });
});
