import { mediaWidths } from "../../../src/shared/contracts/media";

export const mediaPrefix = (shopId: string, id: string) => `${shopId}/${id}/`;
export function mediaKeys(shopId: string, id: string): string[] {
  return [
    "original.pdf",
    ...["original", "cutout"].flatMap((name) => [
      `${name}.webp`,
      ...mediaWidths.map((width) => `${name}-${width}.webp`),
    ]),
  ].map((name) => mediaPrefix(shopId, id) + name);
}
export async function deleteMediaObjects(env: Pick<Env, "MEDIA" | "MEDIA_PUBLIC">, shopId: string, id: string) {
  const keys = mediaKeys(shopId, id);
  await Promise.all([env.MEDIA.delete(keys), env.MEDIA_PUBLIC.delete(keys)]);
}
