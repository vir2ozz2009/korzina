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
    display: record.display,
    cutout: record.cutout,
    image: publicPurposes.includes(record.purpose)
      ? {
          ...source(record.display === "cutout" ? "cutout" : "original"),
          display: record.display,
          original: { src: `${prefix}original.webp` },
        }
      : null,
  };
}
