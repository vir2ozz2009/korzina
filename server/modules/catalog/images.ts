import type { CatalogImage } from "../../../src/shared/contracts/catalog";
import { mediaWidths } from "../../../src/shared/contracts/media";
import demoImages from "./demo-images.json";

const demoImageMap = new Map(Object.entries(demoImages));

export function catalogImage(id: string | null, shopId: string, origin: string): CatalogImage | null {
  if (!id) return null;
  const demo = demoImageMap.get(id);
  if (demo) return demo;
  const prefix = `${origin}/${shopId}/${id}/original`;
  return {
    src: `${prefix}-800.webp`,
    srcSet: mediaWidths.map((width) => `${prefix}-${width}.webp ${width}w`).join(", "),
    original: { src: `${prefix}.webp` },
  };
}
