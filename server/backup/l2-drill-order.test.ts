import { runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { expect, it } from "vitest";
import { configureTrainingShop, createTrainingOrder } from "../../scripts/l2-drill/order";
import { createBackup, verifyRestore } from "./service";

it("creates a real isolated training checkout with money snapshot and outbox", async () => {
  const id = "l2-order-local-test";
  const shop = exports.Shop.get(exports.Shop.idFromName(id));
  await shop.seedDemoCatalog(id);
  await runInDurableObject(shop, (_instance, ctx) => configureTrainingShop(ctx.storage));
  await createTrainingOrder(shop, id);
  const snapshot = await shop.backupSnapshot();
  const orders = snapshot.tables.find((table) => table.name === "orders");
  const outbox = snapshot.tables.find((table) => table.name === "order_outbox");
  expect(orders?.rows).toHaveLength(1);
  expect(outbox?.rows).toHaveLength(1);
  const raw = orders?.rows[0][orders.columns.indexOf("snapshot")];
  expect(typeof raw).toBe("string");
  expect(JSON.parse(raw as string)).toMatchObject({ currency: "VND", totalMinor: 45000 });
});

it("restores a training order and its monetary snapshot and outbox twice without altering the source", async () => {
  const ids = ["l2-roundtrip-a", "l2-roundtrip-b"];
  await env.PLATFORM.batch([
    env.PLATFORM.prepare("CREATE TABLE shops (id TEXT PRIMARY KEY)"),
    ...ids.map((id) => env.PLATFORM.prepare("INSERT INTO shops (id) VALUES (?)").bind(id)),
  ]);
  const shop = exports.Shop.get(exports.Shop.idFromName(ids[0]));
  await shop.seedDemoCatalog(ids[0]);
  await runInDurableObject(shop, (_instance, ctx) => configureTrainingShop(ctx.storage));
  await createTrainingOrder(shop, ids[0]);
  const before = await shop.backupSnapshot();
  const key = await createBackup(env, exports, new Date());
  for (let attempt = 0; attempt < 2; attempt++) {
    expect(await verifyRestore(env, exports, key)).toMatchObject({ ok: true, shops: 2 });
    const target = await exports.RestoreShop.get(exports.RestoreShop.idFromName(ids[0])).backupSnapshot();
    const originalOrder = before.tables.find((table) => table.name === "orders");
    const restoredOrder = target.tables.find((table) => table.name === "orders");
    const originalOutbox = before.tables.find((table) => table.name === "order_outbox");
    expect(restoredOrder).toEqual(originalOrder);
    expect(target.tables.find((table) => table.name === "order_outbox")).toEqual(originalOutbox);
    expect(originalOutbox?.rows.length).toBeGreaterThan(0);
    expect(await shop.backupSnapshot()).toEqual(before);
  }
});

it("reports a missing training manifest as an error and writes no success report", async () => {
  const key = "korzina-prod/v1/runs/2099-01-01T00:00:00.000Z.json";
  await expect(verifyRestore(env, exports, key)).rejects.toThrow("Missing backup manifest");
  expect(await env.BACKUPS.get("korzina-prod/v1/reports/2099-01-01T00:00:00.000Z.json")).toBeNull();
});
