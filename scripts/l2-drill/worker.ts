// Standalone, explicitly bound training worker. Never route this entrypoint through the app.
import { exports } from "cloudflare:workers";
import { createBackup, verifyRestore } from "../../server/backup/service";

export { RestoreShop } from "../../server/backup/RestoreShop";
export { Shop } from "../../server/shop/Shop";

type DrillEnv = Env & { DRILL_TOKEN: string };
const ids = ["l2-training-a", "l2-training-b"];

export default {
  async fetch(request: Request, env: DrillEnv) {
    if (String(env.APP_ENV) !== "l2-drill" || request.method !== "POST" || !env.DRILL_TOKEN)
      return new Response(null, { status: 404 });
    const actual = new TextEncoder().encode(request.headers.get("Authorization") ?? "");
    const expected = new TextEncoder().encode(`Bearer ${env.DRILL_TOKEN}`);
    const [a, b] = await Promise.all([
      crypto.subtle.digest("SHA-256", actual),
      crypto.subtle.digest("SHA-256", expected),
    ]);
    const left = new Uint8Array(a);
    const right = new Uint8Array(b);
    let difference = 0;
    for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
    if (difference !== 0) return new Response(null, { status: 404 });
    const marker = ".l2-drill-identity";
    const buckets = [
      [env.MEDIA, "korzina-l2-drill-20261128-private"],
      [env.MEDIA_PUBLIC, "korzina-l2-drill-20261128-public"],
      [env.BACKUPS, "korzina-l2-drill-20261128-backups"],
      [env.RESTORE_MEDIA, "korzina-l2-drill-20261128-restore"],
    ] as const;
    for (const [bucket, identity] of buckets) {
      const objects = (await bucket.list({ limit: 2 })).objects;
      const value = await bucket.get(marker);
      if (objects.length !== 1 || objects[0].key !== marker || !value || (await value.text()) !== identity)
        throw new Error("Training bucket identity mismatch");
    }
    const databases = [
      [env.PLATFORM, "8e9a1210-1d84-4861-be7d-d051c81564d6"],
      [env.RESTORE_PLATFORM, "b6801517-bffe-4d3e-b46f-bb50c39f165a"],
    ] as const;
    for (const [db, identity] of databases) {
      const tables = await db
        .prepare(
          "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'sqlite_%'",
        )
        .all();
      if (tables.results.length !== 1 || tables.results[0].name !== "l2_drill_identity")
        throw new Error("Training database identity mismatch");
      const row = await db.prepare("SELECT identity FROM l2_drill_identity").first<{ identity: string }>();
      if (row?.identity !== identity) throw new Error("Training database identity mismatch");
    }
    for (const [bucket] of buckets) await bucket.delete(marker);
    await env.PLATFORM.batch([
      env.PLATFORM.prepare("CREATE TABLE shops (id TEXT PRIMARY KEY)"),
      ...ids.map((id) => env.PLATFORM.prepare("INSERT INTO shops (id) VALUES (?)").bind(id)),
    ]);
    for (const id of ids) await exports.Shop.get(exports.Shop.idFromName(id)).seedDemoCatalog(id);
    await env.MEDIA.put("l2-training-a/receipt", "training-private");
    await env.MEDIA_PUBLIC.put("l2-training-a/photo", "training-public");
    const before = await exports.Shop.get(exports.Shop.idFromName(ids[0])).backupSnapshot();
    const key = await createBackup(env, exports, new Date());
    const report = await verifyRestore(env, exports, key);
    const after = await exports.Shop.get(exports.Shop.idFromName(ids[0])).backupSnapshot();
    if (JSON.stringify(before) !== JSON.stringify(after) || report.shops !== 2 || report.media !== 2)
      throw new Error("Training verification failed");
    await env.BACKUPS.put("l2-drill-final.json", JSON.stringify({ ok: true, run: key, shops: 2, media: 2 }));
    return Response.json({ ok: true, shops: report.shops, media: report.media });
  },
};
