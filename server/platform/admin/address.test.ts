import { env } from "cloudflare:workers";
import { beforeAll, expect, it } from "vitest";
import { setupPlatform } from "../../testing/platform";
import { createDraft } from "./registry";
import { changeShop } from "./shop-change";
import { managedShop } from "./shop-detail";

beforeAll(setupPlatform);
const database = env.PLATFORM;
const bindings = { ...env, ENCRYPTION_KEY: "af".repeat(32) };
const actor = "address-test";
const command = () => ({ key: crypto.randomUUID(), fingerprint: crypto.randomUUID() });

it("§9.7 · §9.10 · §9.12 адрес меняется только у черновика и атомарно записывается в журнал", async () => {
  const { id } = await createDraft(database, bindings, actor, command(), {
    name: "Сыр",
    slug: "draft-cheese",
    country: "VN",
  });
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
  await database
    .prepare(`CREATE TRIGGER fail_address_audit BEFORE INSERT ON platform_audit WHEN new.action='shop.data'
    BEGIN SELECT RAISE(ABORT,'audit failure fixture'); END`)
    .run();
  try {
    await expect(
      changeShop(
        database,
        { id, actor, command: command(), version: 0 },
        { ...data, slug: "fresh-cheese" },
        bindings,
        false,
      ),
    ).rejects.toThrow();
    expect((await managedShop(database, id)).slug).toBe("draft-cheese");
    expect(await database.prepare("SELECT host FROM domains WHERE shop_id=?").bind(id).first()).toMatchObject({
      host: "draft-cheese.demo.korzina.app",
    });
  } finally {
    await database.prepare("DROP TRIGGER fail_address_audit").run();
  }
  const renamed = { id, actor, command: command(), version: 0 };
  const result = await changeShop(database, renamed, { ...data, slug: "fresh-cheese" }, bindings, false);
  expect(await changeShop(database, renamed, { ...data, slug: "fresh-cheese" }, bindings, false)).toEqual(result);
  expect(result.version).toBe(1);
  expect(await database.prepare("SELECT host FROM domains WHERE shop_id=?").bind(id).all()).toMatchObject({
    results: [{ host: "fresh-cheese.demo.korzina.app" }],
  });
  const event = await database
    .prepare("SELECT changed FROM platform_audit WHERE shop_id=? AND action='shop.data'")
    .bind(id)
    .first<{ changed: string }>();
  expect(JSON.parse(event?.changed ?? "{}")).toMatchObject({
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
