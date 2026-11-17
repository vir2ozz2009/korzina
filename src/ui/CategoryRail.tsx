import type { ReactNode } from "react";
export function CategoryRail({ children }: { children: ReactNode }) {
  return (
    <div className="category-viewport">
      <nav aria-label="Категории" className="category-mosaic">
        {children}
      </nav>
    </div>
  );
}
