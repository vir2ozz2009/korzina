import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { expect, it, vi } from "vitest";
import { createRepeatWorker, type Shop } from "./repeat-worker";

it("repeats the full drill while preserving the old backup and isolating the source", async () => {
  const ids = ["l2-training-a", "l2-training-b"];
  for (const [db, identity] of [
    [env.PLATFORM, "8e9a1210-1d84-4861-be7d-d051c81564d6"],
    [env.RESTORE_PLATFORM, "b6801517-bffe-4d3e-b46f-bb50c39f165a"],
  ] as const) {
    await db.batch([
      db.prepare("CREATE TABLE l2_drill_identity (identity TEXT)"),
      db.prepare("INSERT INTO l2_drill_identity VALUES (?)").bind(identity),
      db.prepare("CREATE TABLE shops (id TEXT PRIMARY KEY)"),
      ...ids.map((id) => db.prepare("INSERT INTO shops VALUES (?)").bind(id)),
    ]);
  }
  await env.MEDIA.put("l2-training-a/receipt", "training-private");
  await env.MEDIA_PUBLIC.put("l2-training-a/photo", "training-public");
  await env.RESTORE_MEDIA.put("private/l2-training-a/receipt", "training-private");
  await env.RESTORE_MEDIA.put("public/l2-training-a/photo", "training-public");
  const old = await env.BACKUPS.put("old-proof", "preserved-old-backup");
  if (!old) throw new Error("Failed to create old proof fixture");
  const mark = async () => {
    for (const [bucket, suffix] of [
      [env.MEDIA, "private"],
      [env.MEDIA_PUBLIC, "public"],
      [env.BACKUPS, "backups"],
      [env.RESTORE_MEDIA, "restore"],
    ] as const)
      await bucket.put(".l2-drill-identity", `korzina-l2-drill-b-${suffix}`);
    await env.RESTORE_PLATFORM.prepare("UPDATE l2_drill_identity SET identity=?")
      .bind("b6801517-bffe-4d3e-b46f-bb50c39f165a")
      .run();
  };
  const request = () =>
    new Request("https://training.invalid/", { method: "POST", headers: { Authorization: "Bearer test-token" } });
  const training = {
    ...env,
    APP_ENV: "l2-drill" as Env["APP_ENV"],
    DRILL_TOKEN: "test-token",
    SHOP_BINDING: exports.Shop as unknown as DurableObjectNamespace<Shop>,
    RESTORE_BINDING: exports.RestoreShop,
  };
  const repeat = createRepeatWorker([{ key: "old-proof", etag: old.etag }]);
  const outbound = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    throw new Error("unexpected outbound request");
  });
  await mark();
  const result = await repeat.fetch(request(), training);
  expect(result.status).toBe(200);
  expect((await env.BACKUPS.head("old-proof"))?.etag).toBe(old.etag);
  const source = exports.Shop.get(exports.Shop.idFromName(ids[0]));
  const target = exports.RestoreShop.get(exports.RestoreShop.idFromName(ids[0]));
  const firstSource = await source.backupSnapshot();
  expect(await env.RESTORE_PLATFORM.prepare("SELECT identity FROM l2_drill_identity").first()).toEqual({
    identity: "8e9a1210-1d84-4861-be7d-d051c81564d6",
  });
  expect(await env.PLATFORM.prepare("SELECT identity FROM l2_drill_identity").first()).toEqual({
    identity: "8e9a1210-1d84-4861-be7d-d051c81564d6",
  });
  await mark();
  expect(await source.backupSnapshot()).toEqual(firstSource);
  expect((await repeat.fetch(request(), training)).status).toBe(200);
  expect((await env.BACKUPS.head("old-proof"))?.etag).toBe(old.etag);
  const sourceAfter = await source.backupSnapshot();
  const restored = await target.backupSnapshot();
  const sourceB = await exports.Shop.get(exports.Shop.idFromName(ids[1])).backupSnapshot();
  const targetB = await exports.RestoreShop.get(exports.RestoreShop.idFromName(ids[1])).backupSnapshot();
  const canonical = (snapshot: typeof sourceB) => ({
    ...snapshot,
    tables: snapshot.tables.map((table) => ({ ...table, rows: table.rows.map((row) => JSON.stringify(row)).sort() })),
  });
  expect(canonical(targetB)).toEqual(canonical(sourceB));
  const table = (data: typeof sourceAfter, name: string) => data.tables.find((item) => item.name === name);
  expect(table(sourceAfter, "orders")?.rows).toHaveLength(2);
  expect(table(sourceAfter, "order_outbox")?.rows).toHaveLength(2);
  expect(table(restored, "orders")).toEqual(table(sourceAfter, "orders"));
  expect(table(restored, "order_outbox")).toEqual(table(sourceAfter, "order_outbox"));
  const orders = table(restored, "orders");
  if (!orders) throw new Error("Missing orders table");
  for (const row of orders.rows)
    expect(JSON.parse(row[orders.columns.indexOf("snapshot")] as string)).toMatchObject({
      currency: "VND",
      totalMinor: 45000,
    });
  // A mistaken D1 binding must be rejected before deleting markers or changing either store.
  await mark();
  const backupKeys = (await env.BACKUPS.list()).objects.map((item) => item.key).sort();
  await expect(repeat.fetch(request(), { ...training, RESTORE_PLATFORM: env.PLATFORM })).rejects.toThrow(
    "database identity mismatch",
  );
  expect(await source.backupSnapshot()).toEqual(sourceAfter);
  expect((await env.BACKUPS.list()).objects.map((item) => item.key).sort()).toEqual(backupKeys);
  expect(await env.MEDIA.get(".l2-drill-identity")).not.toBeNull();
  for (const stub of [source, target]) {
    await runInDurableObject(stub, async (_instance, state) => {
      await state.storage.setAlarm(Date.now() + 10_000);
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);
  }
  expect(await source.backupSnapshot()).toEqual(sourceAfter);
  expect(await target.backupSnapshot()).toEqual(restored);
  expect(outbound).not.toHaveBeenCalled();
  await runInDurableObject(source, async () => {
    await expect(fetch("https://notification-test.invalid/")).rejects.toThrow("unexpected outbound request");
  });
  expect(outbound).toHaveBeenCalledTimes(1);
  outbound.mockRestore();
});
