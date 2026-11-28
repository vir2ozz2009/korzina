import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import worker, { RestoreShop, Shop } from "../../scripts/l2-drill/worker";

it("экспортирует оба независимых класса хранилища", () => {
  expect(Shop).toBeTypeOf("function");
  expect(RestoreShop).toBeTypeOf("function");
  expect(Shop).not.toBe(RestoreShop);
});

it("не запускает учебное восстановление в обычной среде", async () => {
  const request = new Request("https://training.invalid/", { method: "POST" });
  const response = await worker.fetch(request, { ...env, DRILL_TOKEN: "test-token" });
  expect(response.status).toBe(404);
});

it("не запускает учебное восстановление без правильного ключа", async () => {
  const request = new Request("https://training.invalid/", { method: "POST" });
  const training = { ...env, APP_ENV: "l2-drill" as Env["APP_ENV"], DRILL_TOKEN: "test-token" };
  expect((await worker.fetch(request, training)).status).toBe(404);
});

it("не пишет в хранилища без меток отдельных учебных ресурсов", async () => {
  const request = new Request("https://training.invalid/", {
    method: "POST",
    headers: { Authorization: "Bearer test-token" },
  });
  const training = { ...env, APP_ENV: "l2-drill" as Env["APP_ENV"], DRILL_TOKEN: "test-token" };
  await expect(worker.fetch(request, training)).rejects.toThrow(/identity|метк/i);
});

it("не запускает восстановление, если private и public указывают на один бакет", async () => {
  await env.MEDIA.put(".l2-drill-identity", "korzina-l2-drill-b-private");
  const request = new Request("https://training.invalid/", {
    method: "POST",
    headers: { Authorization: "Bearer test-token" },
  });
  const training = {
    ...env,
    APP_ENV: "l2-drill" as Env["APP_ENV"],
    DRILL_TOKEN: "test-token",
    MEDIA_PUBLIC: env.MEDIA,
  };
  await expect(worker.fetch(request, training)).rejects.toThrow(/bucket identity mismatch/i);
  expect(await (await env.MEDIA.get(".l2-drill-identity"))?.text()).toBe("korzina-l2-drill-b-private");
});

it("не удаляет source, если restore D1 ошибочно совпадает с source", async () => {
  const identities = [
    [env.MEDIA, "private"],
    [env.MEDIA_PUBLIC, "public"],
    [env.BACKUPS, "backups"],
    [env.RESTORE_MEDIA, "restore"],
  ] as const;
  for (const [bucket, suffix] of identities) await bucket.put(".l2-drill-identity", `korzina-l2-drill-b-${suffix}`);
  await env.PLATFORM.batch([
    env.PLATFORM.prepare("CREATE TABLE l2_drill_identity (identity TEXT)"),
    env.PLATFORM.prepare("INSERT INTO l2_drill_identity VALUES (?)").bind("8e9a1210-1d84-4861-be7d-d051c81564d6"),
  ]);
  const request = new Request("https://training.invalid/", {
    method: "POST",
    headers: { Authorization: "Bearer test-token" },
  });
  const training = {
    ...env,
    APP_ENV: "l2-drill" as Env["APP_ENV"],
    DRILL_TOKEN: "test-token",
    RESTORE_PLATFORM: env.PLATFORM,
  };
  await expect(worker.fetch(request, training)).rejects.toThrow(/database identity mismatch/i);
  expect(await env.PLATFORM.prepare("SELECT identity FROM l2_drill_identity").first()).toEqual({
    identity: "8e9a1210-1d84-4861-be7d-d051c81564d6",
  });
  expect(await env.MEDIA.get(".l2-drill-identity")).not.toBeNull();
  await env.PLATFORM.prepare("DROP TABLE l2_drill_identity").run();
});

it("восстанавливает только две ранее подготовленные учебные базы с сохранённым набором магазинов", async () => {
  const buckets = [
    [env.MEDIA, "private"],
    [env.MEDIA_PUBLIC, "public"],
    [env.BACKUPS, "backups"],
    [env.RESTORE_MEDIA, "restore"],
  ] as const;
  for (const [bucket, suffix] of buckets) await bucket.put(".l2-drill-identity", `korzina-l2-drill-b-${suffix}`);
  for (const [db, identity] of [
    [env.PLATFORM, "8e9a1210-1d84-4861-be7d-d051c81564d6"],
    [env.RESTORE_PLATFORM, "b6801517-bffe-4d3e-b46f-bb50c39f165a"],
  ] as const) {
    await db.batch([
      db.prepare("CREATE TABLE l2_drill_identity (identity TEXT)"),
      db.prepare("INSERT INTO l2_drill_identity VALUES (?)").bind(identity),
      db.prepare("CREATE TABLE shops (id TEXT PRIMARY KEY)"),
      db.prepare("INSERT INTO shops VALUES ('l2-training-a'),('l2-training-b')"),
    ]);
  }
  const request = new Request("https://training.invalid/", {
    method: "POST",
    headers: { Authorization: "Bearer test-token" },
  });
  const training = { ...env, APP_ENV: "l2-drill" as Env["APP_ENV"], DRILL_TOKEN: "test-token" };
  expect((await worker.fetch(request, training)).status).toBe(200);
  expect(await (await env.BACKUPS.get("l2-drill-final.json"))?.json()).toMatchObject({ ok: true, shops: 2, media: 2 });
});
