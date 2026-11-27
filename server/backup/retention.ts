import { allObjects, backupRoot } from "./media";

// Retain all completed runs in the last 30 days and the newest run per month for 12 months.
export function retainedKeys(keys: string[], now: Date) {
  const dailyCutoff = now.getTime() - 30 * 86400000;
  const monthCutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1)).toISOString().slice(0, 7);
  const months = new Set<string>();
  return new Set(
    keys
      .sort()
      .reverse()
      .filter((key) => {
        const date = key.slice(`${backupRoot}runs/`.length, -5);
        const month = date.slice(0, 7);
        if (!Number.isFinite(Date.parse(date))) throw new Error("Invalid backup date");
        const monthly = month >= monthCutoff && !months.has(month);
        months.add(month);
        return Date.parse(date) > dailyCutoff || monthly;
      }),
  );
}

export async function pruneBackups(bucket: R2Bucket, now: Date) {
  const runs = await allObjects(bucket, `${backupRoot}runs/`);
  const keep = retainedKeys(
    runs.map((r) => r.key),
    now,
  );
  const blobs = new Set<string>();
  // Read all retained manifests before deleting anything; corruption fails closed.
  for (const key of keep) {
    const object = await bucket.get(key);
    if (!object) throw new Error("Missing retained manifest");
    const run = await object.json<{ media: { blob: string }[]; shops: { key: string }[]; platform: string }>();
    for (const entry of run.media) blobs.add(entry.blob);
    for (const entry of run.shops) blobs.add(entry.key);
    blobs.add(run.platform);
  }
  for (const run of runs) if (!keep.has(run.key)) await bucket.delete(run.key);
  for (const prefix of ["blobs/", "snapshots/"]) {
    for (const object of await allObjects(bucket, backupRoot + prefix)) {
      // Grace period also protects an unfinished concurrent run.
      if (!blobs.has(object.key) && object.uploaded.getTime() < now.getTime() - 2 * 86400000)
        await bucket.delete(object.key);
    }
  }
}
