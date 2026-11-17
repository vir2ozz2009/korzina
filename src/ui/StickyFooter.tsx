import type { ReactNode } from "react";
export function StickyFooter({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-20 border-t border-border bg-card px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {children}
    </div>
  );
}
