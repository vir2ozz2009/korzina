import type { ReactNode } from "react";
export function StickyFooter({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-(--tab-height) z-20 border-t border-border bg-card px-3 pt-3 pb-[max(0.75rem,var(--safe-bottom))]">
      {children}
    </div>
  );
}
