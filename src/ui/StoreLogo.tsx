import { useState } from "react";
export function StoreLogo({ name, src }: { name: string; src?: string }) {
  const [failed, setFailed] = useState<string>();
  return (
    <span role="img" aria-label={name} className="store-logo">
      {src && src !== failed ? (
        <img src={src} alt="" onError={() => setFailed(src)} />
      ) : (
        <span className="text-primary-text">{Array.from(name.trim())[0]?.toLocaleUpperCase("ru") || "К"}</span>
      )}
    </span>
  );
}
