import { Link } from "@tanstack/react-router";

const tabs = [
  ["/catalog", "Все товары"],
  ["/categories", "Категории"],
  ["/brands", "Бренды"],
] as const;
export function CatalogTabs({ active }: { active: (typeof tabs)[number][0] }) {
  return (
    <nav aria-label="Разделы каталога" className="flex gap-2 overflow-x-auto bg-background py-2">
      {tabs.map(([to, label]) => (
        <Link
          key={to}
          to={to}
          aria-current={to === active ? "page" : undefined}
          className={`flex min-h-11 shrink-0 items-center rounded-pill px-3 text-label ${to === active ? "bg-primary-soft text-primary-text" : "bg-card"}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
