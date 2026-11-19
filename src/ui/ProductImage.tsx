import type { CSSProperties, ReactNode } from "react";
import { Img } from "./Img";
import type { ProductImageSource } from "./product-image";

export interface ProductImageProps extends Partial<ProductImageSource> {
  alt: string;
  sizes?: string;
  shape?: "square" | "tile";
  radius?: "md" | "xl";
  className?: string;
  fallback?: ReactNode;
  fit?: "contain" | "cover";
  priority?: boolean;
}
export function ProductImage({
  src,
  srcSet,
  edgeColor,
  alt,
  sizes,
  shape = "square",
  radius = "md",
  className = "",
  fallback,
  fit = "contain",
  priority,
}: ProductImageProps) {
  return (
    <span
      style={fit === "contain" ? ({ "--photo-edge": edgeColor } as CSSProperties) : undefined}
      className={`relative flex self-start items-center justify-center overflow-hidden bg-[var(--photo-edge,var(--card))] ${shape === "tile" ? "aspect-[179/142]" : "aspect-square"} ${radius === "xl" ? "rounded-xl" : "rounded-md"} ${className}`}
    >
      <Img
        src={src}
        srcSet={srcSet}
        sizes={sizes}
        alt={alt}
        fallback={fallback}
        priority={priority}
        className={`absolute inset-0 size-full ${fit === "cover" ? "[&_img]:size-full" : ""}`}
        imageClassName={
          fit === "cover"
            ? "size-full object-cover object-center"
            : "object-contain object-center [mask-image:var(--product-mask)] [mask-composite:intersect] [mask-repeat:no-repeat]"
        }
      />
    </span>
  );
}
