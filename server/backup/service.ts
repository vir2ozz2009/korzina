import type { exports as workerExports } from "cloudflare:workers";
import { allObjects, backupMedia, backupRoot, type MediaEntry, restoreMedia } from "./media";
import { restorePlatform } from "./platform-restore";
import { pruneBackups } from "./retention";
import { type Snapshot, snapshotPlatform } from "./snapshot";

type Namespaces = Pick<typeof workerExports, "Shop" | "RestoreShop">;
type Run = { version: 1; time: string; platform: string; shops: { id: string; key: string }[]; media: MediaEntry[] };
const canonical = (snapshot: Snapshot) =>
  JSON.stringify({
    ...snapshot,
    tables: snapshot.tables.map((t) => ({ ...t, rows: t.rows.map((r) => JSON.stringify(r)).sort() })),
  });
async function digest(text: string) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
async function save(bucket: R2Bucket, snapshot: Snapshot) {
  const text = canonical(snapshot);
  const key = `${backupRoot}snapshots/${await digest(text)}.json`;
  if (!(await bucket.head(key))) await bucket.put(key, text);
  return key;
}
async function load(bucket: R2Bucket, key: string): Promise<Snapshot> {
  if (!key.startsWith(`${backupRoot}snapshots/`)) throw new Error("Wrong backup prefix");
  const object = await bucket.get(key);
  if (!object) throw new Error("Missing backup snapshot");
  const text = await object.text();
  if (!key.endsWith(`/${await digest(text)}.json`)) throw new Error("Backup checksum mismatch");
  // Canonical snapshots sort encoded rows for comparison; decode them for replay.
  const data = JSON.parse(text);
  for (const table of data.tables) table.rows = table.rows.map((r: string) => JSON.parse(r));
  return data;
}
export async function createBackup(env: Env, namespaces: Namespaces, now: Date) {
  const platform = await snapshotPlatform(env.PLATFORM);
  const shops = platform.tables.find((t) => t.name === "shops");
  const ids = shops?.rows.map((row) => String(row[shops.columns.indexOf("id")])) ?? [];
  const run: Run = {
    version: 1,
    time: now.toISOString(),
    platform: await save(env.BACKUPS, platform),
    shops: [],
    media: [],
  };
  for (const id of ids) {
    const snapshot = await namespaces.Shop.get(namespaces.Shop.idFromName(id)).backupSnapshot();
    run.shops.push({ id, key: await save(env.BACKUPS, snapshot) });
  }
  run.media = await backupMedia(env);
  const key = `${backupRoot}runs/${run.time}.json`;
  // This is the completion marker. Partial runs never become restore candidates.
  await env.BACKUPS.put(key, JSON.stringify(run));
  return key;
}
export async function verifyRestore(env: Env, namespaces: Namespaces, key: string) {
  if (!key.startsWith(`${backupRoot}runs/`)) throw new Error("Wrong run prefix");
  const object = await env.BACKUPS.get(key);
  if (!object) throw new Error("Missing backup manifest");
  const run = await object.json<Run>();
  if (run.version !== 1) throw new Error("Wrong run version");
  const platform = await load(env.BACKUPS, run.platform);
  if (canonical(await restorePlatform(env.RESTORE_PLATFORM, platform)) !== canonical(platform))
    throw new Error("D1 restore mismatch");
  // Restore every shop, including order history and money; no live Shop is mutated.
  for (const shop of run.shops) {
    const snapshot = await load(env.BACKUPS, shop.key);
    const restored = await namespaces.RestoreShop.get(namespaces.RestoreShop.idFromName(shop.id)).restoreSnapshot(
      snapshot,
    );
    if (canonical(restored) !== canonical(snapshot)) throw new Error("Shop restore mismatch");
  }
  await restoreMedia(env.BACKUPS, env.RESTORE_MEDIA, run.media);
  const restored = await allObjects(env.RESTORE_MEDIA);
  if (restored.length !== run.media.length) throw new Error("Media count mismatch");
  for (const entry of run.media) {
    const object = await env.RESTORE_MEDIA.head(`${entry.source}/${entry.key}`);
    if (!object || object.size !== entry.size || object.etag !== entry.backupEtag)
      throw new Error("Media restore mismatch");
  }
  const report = {
    ok: true,
    run: key,
    shops: run.shops.length,
    media: run.media.length,
    checkedAt: new Date().toISOString(),
  };
  await env.BACKUPS.put(`${backupRoot}reports/${run.time}.json`, JSON.stringify(report));
  return report;
}
export async function scheduledBackup(env: Env, namespaces: Namespaces, time: number) {
  if (env.APP_ENV !== "production") throw new Error("Production backup schedule only");
  const now = new Date(time);
  try {
    const key = await createBackup(env, namespaces, now);
    const reports = await env.BACKUPS.list({
      prefix: `${backupRoot}reports/${now.toISOString().slice(0, 7)}`,
      limit: 1,
    });
    if (!reports.objects.length) await verifyRestore(env, namespaces, key);
    await pruneBackups(env.BACKUPS, now);
    console.log(JSON.stringify({ event: "backup_complete", run: key }));
  } catch {
    console.error(JSON.stringify({ event: "backup_failed", time: now.toISOString() }));
    throw new Error("Production backup failed; inspect private backup state");
  }
}
