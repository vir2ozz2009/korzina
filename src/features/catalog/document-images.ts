import type { CatalogImage } from "../../shared/contracts/catalog";

// The shared document has paths only. Resolve them against this storefront's
// uncached bootstrap, keeping photos on R2 rather than proxying them through Shop.
export function resolveDocumentImage(image: CatalogImage | null, origin: string): CatalogImage | null {
  if (!image) return null;
  const absolute = (path: string) => `${origin}${path}`;
  return {
    ...image,
    src: absolute(image.src),
    srcSet: image.srcSet.split(", ").map(absolute).join(", "),
    original: { src: absolute(image.original.src) },
  };
}
