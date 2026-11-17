import type { CatalogImage } from "../../../src/shared/contracts/catalog";
import type { PhotoMetadata } from "../../../src/shared/contracts/media";
import { mediaWidths } from "../../../src/shared/contracts/media";
import demoImages from "../../../src/shared/demo-images.json";

const demoImageMap = new Map(Object.entries(demoImages));

export function catalogImage(
  id: string | null,
  shopId: string,
  origin: string,
  metadata: PhotoMetadata = {},
): CatalogImage | null {
  if (!id) return null;
  const demo = demoImageMap.get(id);
  if (demo) return demo;
  const prefix = `${origin}/${shopId}/${id}/original`;
  return {
    ...metadata,
    src: `${prefix}-800.webp`,
    srcSet: mediaWidths.map((width) => `${prefix}-${width}.webp ${width}w`).join(", "),
    original: { src: `${prefix}.webp` },
  };
}

export function documentImage(value: string | null, shopId: string) {
  if (!value) return null;
  const { id, ...metadata } = JSON.parse(value) as PhotoMetadata & { id: string };
  const image = catalogImage(
    id,
    shopId,
    "",
    Object.fromEntries(Object.entries(metadata).filter(([, value]) => value !== null)),
  );
  if (!image) return null;
  const relative = (url: string) => url.replace(/^https?:\/\/[^/]+/, "");
  return {
    ...image,
    src: relative(image.src),
    srcSet: image.srcSet.split(", ").map(relative).join(", "),
    original: { src: relative(image.original.src) },
  };
}
