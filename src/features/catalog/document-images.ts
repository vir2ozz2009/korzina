import type { CatalogImage } from "../../shared/contracts/catalog";

// Resolve shop-relative paths against this storefront's
// uncached bootstrap, keeping photos on R2 rather than proxying them through Shop.
export function resolveDocumentImage(image: CatalogImage | null, origin: string): CatalogImage | null {
  if (!image) return null;
  const absolute = (path: string) => (/^(?:https?:)?\/\//.test(path) ? path : `${origin}${path}`);
  return {
    ...image,
    src: absolute(image.src),
    srcSet: image.srcSet.split(", ").map(absolute).join(", "),
    original: { src: absolute(image.original.src) },
  };
}
