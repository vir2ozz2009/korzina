import { useState } from "react";
export function Avatar({ name, src }: { name: string; src?: string }) {
  const [failed, setFailed] = useState<string>();
  return (
    <span
      role="img"
      aria-label={name}
      className="inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-pill bg-secondary text-label"
    >
      {src && failed !== src ? (
        <img src={src} alt="" className="size-full object-cover" onError={() => setFailed(src)} />
      ) : (
        (Array.from(name.trim())[0]?.toUpperCase() ?? "?")
      )}
    </span>
  );
}
