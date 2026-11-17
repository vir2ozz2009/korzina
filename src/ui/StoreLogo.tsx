import { useState } from "react";
export function StoreLogo({ name, src }: { name: string; src?: string }) {
  const [failed, setFailed] = useState<string>();
  return (
    <span
      role="img"
      aria-label={name}
      className="flex h-(--store-mark-height) max-w-(--store-mark-width) items-center justify-center text-(length:--store-logo-font) font-bold"
    >
      {src && src !== failed ? (
        <img
          className="h-auto w-auto max-h-(--store-mark-height) max-w-(--store-mark-width) object-contain"
          src={src}
          alt=""
          onError={() => setFailed(src)}
        />
      ) : (
        <span className="text-primary-text">{Array.from(name.trim())[0]?.toLocaleUpperCase("ru") || "К"}</span>
      )}
    </span>
  );
}
