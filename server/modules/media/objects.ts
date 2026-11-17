export const mediaPrefix = (shopId: string, id: string) => `${shopId}/${id}/`;

async function deletePrefix(bucket: R2Bucket, prefix: string) {
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor, limit: 1000 });
    if (page.objects.length) await bucket.delete(page.objects.map((object) => object.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}
export async function deleteMediaObjects(env: Pick<Env, "MEDIA" | "MEDIA_PUBLIC">, shopId: string, id: string) {
  const prefix = mediaPrefix(shopId, id);
  await Promise.all([deletePrefix(env.MEDIA, prefix), deletePrefix(env.MEDIA_PUBLIC, prefix)]);
}
