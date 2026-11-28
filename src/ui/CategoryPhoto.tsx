import type { ProductImageSource } from "./product-image";
export function CategoryPhoto({ source, onError }: { source: ProductImageSource; onError: () => void }) {
  return (
    <img
      className="pointer-events-none block h-full w-full rounded-(--category-photo-radius) object-contain"
      data-category-photo
      data-photo-src={source.src}
      src={source.src}
      srcSet={source.srcSet}
      alt=""
      loading="lazy"
      decoding="async"
      onError={onError}
    />
  );
}
