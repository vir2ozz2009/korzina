import { env, exports } from "cloudflare:workers";
import { beforeAll, beforeEach, expect, it } from "vitest";
import { buy, customer, getQuote, setupCheckout } from "../modules/checkout/testing";
import { setupPlatform } from "../testing/platform";
import { allObjects, backupRoot } from "./media";
import { retainedKeys } from "./retention";
import { createBackup, scheduledBackup, verifyRestore } from "./service";

beforeAll(setupPlatform);
beforeEach(async () => {
  for (const bucket of [env.BACKUPS, env.MEDIA, env.MEDIA_PUBLIC, env.RESTORE_MEDIA]) {
    for (const object of await allObjects(bucket)) await bucket.delete(object.key);
  }
});
it("L2: восстанавливает D1, два DO SQLite (включая FTS/триггеры) и private/public R2 без изменения источника", async () => {
  await env.MEDIA.put("korzina-demo-lavka/receipt", "private-proof");
  await env.MEDIA_PUBLIC.put("korzina-demo-lavka/photo", "public-photo", {
    httpMetadata: { contentType: "image/webp" },
  });
  await setupCheckout();
  const cookie = await customer("sku-01");
  const quote = await getQuote(cookie);
  const order = await buy("checkout", { quoteRevision: quote.quoteRevision, payment: "cash" }, cookie);
  expect(order.status).toBe(201);
  const now = new Date("2026-11-27T01:00:00Z");
  const key = await createBackup(env, exports, now);
  const source = exports.Shop.get(exports.Shop.idFromName("korzina-demo-lavka"));
  const before = await source.backupSnapshot();
  const report = await verifyRestore(env, exports, key);
  expect(report).toMatchObject({ ok: true, shops: 2, media: 2 });
  expect(await source.backupSnapshot()).toEqual(before);
  const restoredSnapshot = await exports.RestoreShop.get(
    exports.RestoreShop.idFromName("korzina-demo-lavka"),
  ).backupSnapshot();
  expect(restoredSnapshot.tables.find((t) => t.name === "orders")?.rows).toHaveLength(1);
  expect(restoredSnapshot.tables.find((t) => t.name === "order_outbox")?.rows.length).toBeGreaterThan(0);
  expect(await (await env.RESTORE_MEDIA.get("private/korzina-demo-lavka/receipt"))?.text()).toBe("private-proof");
  expect((await env.RESTORE_MEDIA.head("public/korzina-demo-lavka/photo"))?.httpMetadata?.contentType).toBe(
    "image/webp",
  );
  // Retry replaces the isolated target; it neither duplicates rows nor emits notifications.
  expect(await verifyRestore(env, exports, key)).toMatchObject({ ok: true });
  await env.MEDIA.delete("korzina-demo-lavka/receipt");
  await env.MEDIA_PUBLIC.put("korzina-demo-lavka/photo", "updated-photo");
  const second = await createBackup(env, exports, new Date(now.getTime() + 86400000));
  expect(second).not.toBe(key);
  expect((await env.BACKUPS.list({ prefix: `${backupRoot}blobs/` })).objects).toHaveLength(3);
  expect(await verifyRestore(env, exports, second)).toMatchObject({ ok: true, media: 1 });
  expect(await (await env.RESTORE_MEDIA.get("public/korzina-demo-lavka/photo"))?.text()).toBe("updated-photo");
  expect(await verifyRestore(env, exports, key)).toMatchObject({ ok: true, media: 2 });
  expect((await env.PLATFORM.prepare("SELECT id FROM shops").all()).results).toHaveLength(2);
});
it("L2: обслуживающий Shop запрещает восстановление и не открывает HTTP восстановления", async () => {
  expect(
    (await exports.default.fetch(new Request("https://demo.korzina.app/api/backup/restore", { method: "POST" })))
      .status,
  ).toBe(404);
});
it("L2: повреждённая копия не считается восстановленной", async () => {
  const key = await createBackup(env, exports, new Date("2026-11-28T01:00:00Z"));
  const run = await (await env.BACKUPS.get(key))?.json<{ platform: string }>();
  if (!run) throw new Error("Missing test run");
  await env.BACKUPS.put(run.platform, "corrupt");
  await expect(verifyRestore(env, exports, key)).rejects.toThrow("checksum");
});
it("L2: сохраняет 30 дней ежедневных и 12 месячных копий", () => {
  const keys = Array.from(
    { length: 400 },
    (_, i) => `${backupRoot}runs/${new Date(Date.UTC(2026, 10, 27) - i * 86400000).toISOString()}.json`,
  );
  const keep = retainedKeys(keys, new Date("2026-11-27T00:00:00Z"));
  expect(keep.has(keys[29])).toBe(true);
  expect(keep.has(keys[30])).toBe(false);
  expect(keep.has(keys[32])).toBe(false);
  expect([...keep].some((k) => k.includes("2025-12"))).toBe(true);
  expect([...keep].some((k) => k.includes("2025-11"))).toBe(false);
});

it("L2: Cron запрещён на demo; месячный drill повторяется только при отсутствии успешного отчёта", async () => {
  const november = Date.parse("2026-11-27T01:00:00Z");
  await expect(scheduledBackup(env, exports, november)).rejects.toThrow("Production backup");
  await scheduledBackup({ ...env, APP_ENV: "production" }, exports, november);
  await scheduledBackup({ ...env, APP_ENV: "production" }, exports, november + 86400000);
  expect((await env.BACKUPS.list({ prefix: `${backupRoot}reports/` })).objects).toHaveLength(1);
  await scheduledBackup({ ...env, APP_ENV: "production" }, exports, Date.parse("2026-12-01T01:00:00Z"));
  expect((await env.BACKUPS.list({ prefix: `${backupRoot}reports/` })).objects).toHaveLength(2);
});
