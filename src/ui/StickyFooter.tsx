import type { ReactNode } from "react";
export function StickyFooter({ children, floating }: { children: ReactNode; floating?: boolean }) {
  if (floating)
    return (
      <div className="pointer-events-none fixed inset-x-3 bottom-(--floating-bottom) z-20 mx-auto max-w-(--content-max) [&_button]:pointer-events-auto">
        {children}
      </div>
    );
  return (
    <div className="sticky bottom-(--tab-height) z-20 border-t border-border bg-card px-3 pt-3 pb-[max(0.75rem,var(--safe-bottom))]">
      {children}
    </div>
  );
}
