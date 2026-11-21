import type { ReactNode } from "react";

export function BuyerPreview({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-1 rounded-lg bg-secondary p-3">
      <p className="text-small text-muted-foreground">Покупатель увидит:</p>
      <p className="text-label">{children}</p>
    </div>
  );
}
