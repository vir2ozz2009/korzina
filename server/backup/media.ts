export type MediaEntry = {
  source: "private" | "public";
  key: string;
  blob: string;
  etag: string;
  backupEtag: string;
  size: number;
  httpMetadata?: R2HTTPMetadata;
  customMetadata?: Record<string, string>;
};
export const backupRoot = "korzina-prod/v1/";
export async function allObjects(bucket: R2Bucket, prefix = "") {
  const objects: R2Object[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor, include: ["httpMetadata", "customMetadata"] });
    objects.push(...page.objects);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return objects;
}
export async function backupMedia(env: Pick<Env, "MEDIA" | "MEDIA_PUBLIC" | "BACKUPS">) {
  const manifest: MediaEntry[] = [];
  for (const [source, bucket] of [
    ["private", env.MEDIA],
    ["public", env.MEDIA_PUBLIC],
  ] as const) {
    for (const object of await allObjects(bucket)) {
      const blob = `${backupRoot}blobs/${source}/${encodeURIComponent(object.key)}/${object.etag}`;
      if (!(await env.BACKUPS.head(blob))) {
        const body = await bucket.get(object.key, { onlyIf: { etagMatches: object.etag } });
        if (!body || !("body" in body)) throw new Error("Media changed during backup; retry");
        await env.BACKUPS.put(blob, body.body, {
          httpMetadata: object.httpMetadata,
          customMetadata: object.customMetadata,
        });
      }
      const copied = await env.BACKUPS.head(blob);
      if (!copied || copied.size !== object.size) throw new Error("Incomplete media copy");
      manifest.push({
        source,
        key: object.key,
        blob,
        etag: object.etag,
        backupEtag: copied.etag,
        size: object.size,
        httpMetadata: object.httpMetadata,
        customMetadata: object.customMetadata,
      });
    }
  }
  return manifest;
}
export async function restoreMedia(backups: R2Bucket, target: R2Bucket, entries: MediaEntry[]) {
  for (const object of await allObjects(target)) await target.delete(object.key);
  for (const entry of entries) {
    if (!entry.blob.startsWith(`${backupRoot}blobs/`)) throw new Error("Invalid media prefix");
    const body = await backups.get(entry.blob);
    if (!body || body.size !== entry.size || body.etag !== entry.backupEtag)
      throw new Error("Missing/corrupt backup media");
    await target.put(`${entry.source}/${entry.key}`, body.body, {
      httpMetadata: entry.httpMetadata,
      customMetadata: entry.customMetadata,
    });
  }
}
