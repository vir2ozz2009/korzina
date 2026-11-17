import type { ReactNode } from "react";
export function CategoryRail({ children }: { children: ReactNode }) {
  return (
    <nav
      aria-label="Категории"
      className="grid auto-cols-(--category-cell) grid-flow-col-dense grid-rows-[repeat(2,var(--category-cell))] gap-2 overflow-x-auto"
    >
      {children}
    </nav>
  );
}
