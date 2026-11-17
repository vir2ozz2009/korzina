import { ImageOff } from "lucide-react";
import { useState } from "react";
export function ProductImage({ src, alt, className = "" }: { src?: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState<string>();
  return (
    <span className={`flex items-center justify-center overflow-hidden rounded-md bg-input ${className}`}>
      {src && failed !== src ? (
        <img src={src} alt={alt} loading="lazy" onError={() => setFailed(src)} className="size-full object-cover" />
      ) : (
        <span role="img" aria-label={`${alt}: без фото`}>
          <ImageOff className="size-8 text-subtle-foreground" />
        </span>
      )}
    </span>
  );
}
