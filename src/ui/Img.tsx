import { ImageOff } from "lucide-react";
import { type ReactNode, useState } from "react";

export function Img({
  src,
  srcSet,
  sizes = "100vw",
  alt,
  priority = false,
  className = "",
  imageClassName = "object-cover",
  fallback,
}: {
  src?: string;
  srcSet?: string;
  sizes?: string;
  alt: string;
  priority?: boolean;
  className?: string;
  imageClassName?: string;
  fallback?: ReactNode;
}) {
  const [failed, setFailed] = useState<string>();
  return (
    <span className={`relative flex items-center justify-center overflow-hidden bg-input ${className}`}>
      {src && failed !== src ? (
        <img
          src={src}
          srcSet={srcSet}
          sizes={sizes}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          onError={() => setFailed(src)}
          className={`size-full ${imageClassName}`}
        />
      ) : (
        <span role="img" aria-label={`${alt}: без фото`} className="text-subtle-foreground">
          {fallback ?? <ImageOff className="size-8" />}
        </span>
      )}
    </span>
  );
}
