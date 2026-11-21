import { useState } from "react";
export function StoreLogo({ name, src, shape }: { name: string; src?: string; shape?: "circle" | "square" | "wide" }) {
  const [failed, setFailed] = useState<string>();
  return (
    <span
      role="img"
      aria-label={name}
      className="flex h-(--store-mark-height) max-w-(--store-mark-width) items-center justify-center text-(length:--store-logo-font) font-bold"
    >
      {src && src !== failed ? (
        <img
          className={
            shape === "circle"
              ? "size-(--store-mark-height) rounded-full object-cover"
              : shape === "square"
                ? "size-(--store-mark-height) rounded-lg object-contain"
                : "h-auto w-auto max-h-(--store-mark-height) max-w-(--store-mark-width) object-contain"
          }
          src={src}
          alt=""
          onError={() => setFailed(src)}
        />
      ) : (
        <span className="grid size-(--store-mark-height) place-items-center rounded-lg bg-primary-soft text-primary-text">
          {Array.from(name.trim())[0]?.toLocaleUpperCase("ru") || "К"}
        </span>
      )}
    </span>
  );
}
