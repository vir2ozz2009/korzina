import type { ReactNode } from "react";
export function CategoryRail({ children }: { children: ReactNode }) {
  return (
    <div className="min-w-0 [container-type:inline-size]">
      <nav
        aria-label="Категории"
        className="grid grid-flow-col-dense auto-cols-(--mosaic-cell) grid-rows-[repeat(2,var(--mosaic-cell))] gap-(--mosaic-gap) overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </nav>
    </div>
  );
}
