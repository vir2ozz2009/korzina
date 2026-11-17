import { useState } from "react";
import type { ProductImageSource } from "./product-image";
export function CategoryPhoto({ source, onError }: { source: ProductImageSource; onError: () => void }) {
  const [loaded, setLoaded] = useState<{ src: string; width: number; height: number }>();
  const width = source.width ?? (loaded?.src === source.src ? loaded.width : undefined);
  const height = source.height ?? (loaded?.src === source.src ? loaded.height : undefined);
  const box = source.contentBox;
  const valid =
    box && box.w > 0 && box.h > 0 && box.x >= 0 && box.y >= 0 && box.x + box.w <= 1.000001 && box.y + box.h <= 1.000001;
  if (valid && width && height)
    return (
      <svg
        className="category-photo"
        data-category-photo
        data-content-box="true"
        data-photo-src={source.src}
        width={width * box.w}
        height={height * box.h}
        viewBox={`${width * box.x} ${height * box.y} ${width * box.w} ${height * box.h}`}
        preserveAspectRatio="xMidYMax meet"
        aria-hidden
      >
        <image href={source.src} width={width} height={height} onError={onError} />
      </svg>
    );
  return (
    <img
      className="category-photo"
      data-category-photo
      data-photo-src={source.src}
      src={source.src}
      srcSet={source.srcSet}
      alt=""
      loading="lazy"
      decoding="async"
      onError={onError}
      onLoad={(event) =>
        setLoaded({
          src: source.src,
          width: event.currentTarget.naturalWidth,
          height: event.currentTarget.naturalHeight,
        })
      }
    />
  );
}
