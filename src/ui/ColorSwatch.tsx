import type { CSSProperties } from "react";

export function ColorSwatch({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        className="size-11 shrink-0 rounded-md border border-border bg-(--swatch)"
        style={{ "--swatch": value } as CSSProperties}
      />
      <div className="min-w-0">
        <p className="text-caption">{label}</p>
        <p className="text-small text-muted-foreground">{value}</p>
      </div>
    </div>
  );
}
