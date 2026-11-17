import { useRef, useState } from "react";
import { ImageViewer } from "./ImageViewer";
import { ProductImage } from "./ProductImage";
import { imageSource, type ProductImageValue } from "./product-image";

export function Gallery({
  images,
  name,
  sizes = "(max-width: 480px) calc(100vw - 64px), 416px",
}: {
  images: readonly ProductImageValue[];
  name: string;
  sizes?: string;
}) {
  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const rail = useRef<HTMLDivElement>(null);
  function move(next: number) {
    const bounded = Math.max(0, Math.min(images.length - 1, next));
    setIndex(bounded);
    rail.current?.scrollTo({
      left: bounded * rail.current.clientWidth,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  }
  if (!images.length) return <ProductImage alt={name} radius="xl" className="w-full" />;
  return (
    <div className="relative">
      <div
        ref={rail}
        className="flex snap-x snap-mandatory overflow-x-auto rounded-xl"
        onScroll={(event) =>
          setIndex(
            Math.min(images.length - 1, Math.round(event.currentTarget.scrollLeft / event.currentTarget.clientWidth)),
          )
        }
      >
        {images.map((image, i) => (
          <button
            type="button"
            key={imageSource(image).src}
            className="aspect-square w-full shrink-0 snap-center overflow-hidden rounded-xl"
            aria-label={`Открыть фото ${i + 1}: ${name}`}
            onClick={() => setExpanded(true)}
          >
            <ProductImage
              {...imageSource(image)}
              alt={`${name}, фото ${i + 1}`}
              sizes={sizes}
              radius="xl"
              className="size-full"
            />
          </button>
        ))}
      </div>
      {images.length > 1 && (
        <div className="absolute inset-x-0 bottom-2 flex justify-center">
          <fieldset
            aria-label={`Фото ${index + 1} из ${images.length}`}
            className="flex min-h-6 gap-1 rounded-pill bg-card px-3"
          >
            {images.map((image, i) => (
              <button
                key={imageSource(image).src}
                type="button"
                aria-label={`Фото ${i + 1}`}
                aria-current={index === i ? "true" : undefined}
                onClick={() => move(i)}
                className="flex min-h-11 min-w-6 items-center justify-center"
              >
                <span className={`size-1.5 rounded-pill ${index === i ? "bg-primary" : "bg-border"}`} />
              </button>
            ))}
          </fieldset>
        </div>
      )}
      {expanded && (
        <ImageViewer
          images={images}
          index={index}
          name={name}
          onIndexChange={move}
          onClose={() => setExpanded(false)}
        />
      )}
    </div>
  );
}
