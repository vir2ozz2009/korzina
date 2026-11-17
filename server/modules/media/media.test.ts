import { runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { cookieFrom, getAuth, postAuth } from "../../testing/auth";
import { setupPlatform } from "../../testing/platform";
import { cleanupMedia } from "./cleanup";
import { signMedia, verifyMedia } from "./signing";

beforeAll(setupPlatform);
const pdf = new TextEncoder().encode("%PDF-1.7\nsynthetic test attachment");
const stub = () => env.SHOP.get(env.SHOP.idFromName("korzina-demo-test2"));
const guest = async () => cookieFrom(await postAuth("/api/auth/guest?shop=test2"));
const upload = (cookie: string, key = crypto.randomUUID(), body = pdf, purpose = "receipt") =>
  exports.default.fetch(
    new Request(`https://demo.korzina.app/api/media/upload?shop=test2&purpose=${purpose}`, {
      method: "POST",
      headers: { Cookie: cookie, "Idempotency-Key": key, "Content-Type": "image/jpeg" },
      body,
    }),
  );

describe("F9: файлы, изоляция, повторы и хранение", () => {
  it("определяет PDF по содержимому, сохраняет один объект при повторе и закрывает чужому покупателю и магазину", async () => {
    const cookie = await guest();
    const key = crypto.randomUUID();
    const first = await upload(cookie, key);
    expect(first.status).toBe(201);
    const record = await first.json<{ id: string; bytes: number }>();
    expect(await (await upload(cookie, key)).json()).toEqual(record);
    expect((await upload(cookie, key, new TextEncoder().encode("%PDF-different"))).status).toBe(409);
    expect(await env.MEDIA.head(`korzina-demo-test2/${record.id}/original.pdf`)).toMatchObject({ size: pdf.length });
    expect(await env.MEDIA_PUBLIC.head(`korzina-demo-test2/${record.id}/original.pdf`)).toBeNull();
    expect((await getAuth(`/api/media/${record.id}/link?shop=test2`, { Cookie: await guest() })).status).toBe(403);
    expect((await getAuth(`/api/media/${record.id}/link?shop=lavka`, { Cookie: cookie })).status).toBe(401);
    const other = cookieFrom(await postAuth("/api/auth/guest?shop=lavka"));
    expect((await getAuth(`/api/media/${record.id}/link?shop=lavka`, { Cookie: other })).status).toBe(404);
    expect((await upload(cookie, crypto.randomUUID(), new TextEncoder().encode("<svg onload='evil()'/>"))).status).toBe(
      400,
    );
    expect((await upload(cookie, crypto.randomUUID(), pdf, "product")).status).toBe(403);
  });
  it("отклоняет 10+ МБ и чужой Origin, не доверяет Content-Length", async () => {
    const cookie = await guest();
    expect((await upload(cookie, crypto.randomUUID(), new Uint8Array(10 * 1024 ** 2 + 1))).status).toBe(413);
    const response = await exports.default.fetch(
      new Request("https://demo.korzina.app/api/media/upload?shop=test2&purpose=receipt", {
        method: "POST",
        headers: { Cookie: cookie, "Idempotency-Key": "cross-origin", Origin: "https://evil.invalid" },
        body: pdf,
      }),
    );
    expect(response.status).toBe(403);
  });
  it("два конкурентных файла не обходят лимит, счётчик и квота проверяются атомарно", async () => {
    const cookie = await guest();
    let used = 0;
    await runInDurableObject(stub(), (_instance, ctx) => {
      used = ctx.storage.sql.exec<{ bytes: number }>("SELECT bytes FROM media_usage WHERE id=1").one().bytes;
    });
    await env.PLATFORM.prepare("INSERT INTO platform_settings (key,value) VALUES ('media_limit_bytes',?)")
      .bind(String(used + pdf.length))
      .run();
    try {
      const responses = await Promise.all([upload(cookie), upload(cookie)]);
      expect(responses.map((response) => response.status).sort()).toEqual([201, 413]);
      const error = responses.find((response) => response.status === 413);
      expect(await error?.json()).toMatchObject({ error: { code: "STORAGE_LIMIT" } });
    } finally {
      await env.PLATFORM.prepare("DELETE FROM platform_settings WHERE key='media_limit_bytes'").run();
    }
  });
  it("убирает temp через сутки и удалённые через 30 дней, сохраняет прикреплённые", async () => {
    const cookie = await guest();
    const create = async () => await (await upload(cookie)).json<{ id: string }>();
    const temp = await create();
    const attached = await create();
    const deleted = await create();
    const sidecar = `korzina-demo-test2/${temp.id}/legacy-version.webp`;
    const keep = `korzina-demo-test2/${attached.id}/legacy-version.webp`;
    await env.MEDIA_PUBLIC.put(sidecar, "old file");
    await env.MEDIA_PUBLIC.put(keep, "attached file");
    expect(
      (await postAuth(`/api/media/${attached.id}/state?shop=test2`, { action: "attach" }, { Cookie: cookie })).status,
    ).toBe(200);
    await postAuth(`/api/media/${deleted.id}/state?shop=test2`, { action: "delete" }, { Cookie: cookie });
    await runInDurableObject(stub(), async (_instance, ctx) => {
      await cleanupMedia(ctx.storage, env, Date.now() + 86_400_001);
      expect(ctx.storage.sql.exec("SELECT id FROM media WHERE id=?", temp.id).toArray()).toEqual([]);
      expect(ctx.storage.sql.exec("SELECT id FROM media WHERE id=?", attached.id).toArray()).toHaveLength(1);
      expect(ctx.storage.sql.exec("SELECT id FROM media WHERE id=?", deleted.id).toArray()).toHaveLength(1);
      await cleanupMedia(ctx.storage, env, Date.now() + 31 * 86_400_000);
      expect(ctx.storage.sql.exec("SELECT id FROM media WHERE id=?", deleted.id).toArray()).toEqual([]);
      expect(ctx.storage.sql.exec("SELECT id FROM media WHERE id=?", attached.id).toArray()).toHaveLength(1);
      const actual = ctx.storage.sql
        .exec<{ bytes: number }>("SELECT coalesce(sum(bytes),0) AS bytes FROM media")
        .one().bytes;
      expect(ctx.storage.sql.exec("SELECT bytes FROM media_usage WHERE id=1").one()).toEqual({ bytes: actual });
    });
    expect(await env.MEDIA.head(`korzina-demo-test2/${temp.id}/original.pdf`)).toBeNull();
    expect(await env.MEDIA_PUBLIC.head(sidecar)).toBeNull();
    expect(await env.MEDIA_PUBLIC.head(keep)).not.toBeNull();
    expect(await env.MEDIA.head(`korzina-demo-test2/${attached.id}/original.pdf`)).not.toBeNull();
  });
  it("подпись короткоживущая, привязана к покупателю, магазину и файлу", async () => {
    const expires = Date.now() + 300_000;
    const sig = await signMedia("synthetic-fixture", "shop", "file", "buyer", expires);
    await expect(verifyMedia("synthetic-fixture", "shop", "file", "buyer", expires, sig)).resolves.toBeUndefined();
    for (const [shop, file, buyer, deadline] of [
      ["other", "file", "buyer", expires],
      ["shop", "file", "other", expires],
      ["shop", "other", "buyer", expires],
      ["shop", "file", "buyer", Date.now() - 1],
    ] as const)
      await expect(verifyMedia("synthetic-fixture", shop, file, buyer, deadline, sig)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
  });
});
