import { ImageOff } from "lucide-react";
import { type ReactNode, useState } from "react";

export function Img({
  src,
  srcSet,
  sizes = "100vw",
  alt,
  priority = false,
  className = "",
  imageClassName = "object-contain object-center",
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
  const [loaded, setLoaded] = useState<string>();
  return (
    <span
      data-loaded={loaded === src}
      className={`image-surface relative flex items-center justify-center overflow-hidden ${className}`}
    >
      {src && failed !== src ? (
        <img
          src={src}
          srcSet={srcSet}
          sizes={sizes}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          onLoad={() => setLoaded(src)}
          onError={() => setFailed(src)}
          className={`h-auto w-auto max-h-full max-w-full ${imageClassName}`}
        />
      ) : (
        <span role="img" aria-label={`${alt}: без фото`} className="text-subtle-foreground">
          {fallback ?? <ImageOff className="size-8" />}
        </span>
      )}
    </span>
  );
}
