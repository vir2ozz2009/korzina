import { ImageOff } from "lucide-react";
import { type ReactNode, useState } from "react";
import type { ProductImageSource } from "./product-image";

export interface ProductImageProps extends Partial<ProductImageSource> {
  alt: string;
  sizes?: string;
  shape?: "square" | "tile";
  radius?: "md" | "xl";
  className?: string;
  fallback?: ReactNode;
}
export function ProductImage({
  src,
  srcSet,
  alt,
  sizes,
  display = "photo",
  shape = "square",
  radius = "md",
  className = "",
  fallback,
}: ProductImageProps) {
  const [failed, setFailed] = useState<string>();
  return (
    <span
      data-image-display={display}
      className={`relative flex self-start items-center justify-center overflow-hidden bg-input ${shape === "tile" ? "aspect-[179/142]" : "aspect-square"} ${radius === "xl" ? "rounded-xl" : "rounded-md"} ${className}`}
    >
      {src && failed !== src ? (
        <img
          src={src}
          srcSet={srcSet}
          sizes={sizes}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(src)}
          className={`absolute inset-0 size-full object-center ${display === "cutout" ? "object-contain p-[8%]" : "object-cover"}`}
        />
      ) : (
        <span role="img" aria-label={`${alt}: без фото`} className="text-subtle-foreground">
          {fallback ?? <ImageOff className="size-8" />}
        </span>
      )}
    </span>
  );
}
