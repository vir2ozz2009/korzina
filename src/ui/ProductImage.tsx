import type { ReactNode } from "react";
import { Img } from "./Img";
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
  shape = "square",
  radius = "md",
  className = "",
  fallback,
}: ProductImageProps) {
  return (
    <span
      className={`relative flex self-start items-center justify-center overflow-hidden bg-input ${shape === "tile" ? "aspect-[179/142]" : "aspect-square"} ${radius === "xl" ? "rounded-xl" : "rounded-md"} ${className}`}
    >
      <Img
        src={src}
        srcSet={srcSet}
        sizes={sizes}
        alt={alt}
        fallback={fallback}
        className="absolute inset-0 size-full"
        imageClassName="object-cover object-center"
      />
    </span>
  );
}
