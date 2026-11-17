import { mediaWidths, publicPurposes } from "../../../src/shared/contracts/media";
import { mediaPrefix } from "./objects";
import type { MediaRecord } from "./schema";

export function presentMedia(record: MediaRecord, shopId: string, origin: string) {
  const prefix = `${origin}/${mediaPrefix(shopId, record.id)}`;
  const source = (name: string) => ({
    src: `${prefix}${name}-800.webp`,
    srcSet: mediaWidths.map((w) => `${prefix}${name}-${w}.webp ${w}w`).join(", "),
  });
  return {
    id: record.id,
    purpose: record.purpose,
    status: record.status,
    bytes: record.bytes,
    image: publicPurposes.includes(record.purpose)
      ? {
          ...source("original"),
          edgeColor: record.edgeColor ?? undefined,
          contentBox: record.contentBox ?? undefined,
          width: record.width ?? undefined,
          height: record.height ?? undefined,
          original: { src: `${prefix}original.webp` },
        }
      : null,
  };
}
