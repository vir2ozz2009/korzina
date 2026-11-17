import { useState } from "react";
export function StoreLogo({ name, src }: { name: string; src?: string }) {
  const [failed, setFailed] = useState<string>();
  return (
    <span
      role="img"
      aria-label={name}
      className="inline-flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-primary text-title-3 text-primary-foreground"
    >
      {src && failed !== src ? (
        <img src={src} alt="" className="size-full object-cover" onError={() => setFailed(src)} />
      ) : (
        name.slice(0, 1).toLocaleUpperCase("ru")
      )}
    </span>
  );
}
