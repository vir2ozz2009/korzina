import { useRouter, useRouterState } from "@tanstack/react-router";
import { Boxes, House, MoreHorizontal, Package } from "lucide-react";
import { useEffect } from "react";

import { useSellerOrderBadge } from "../../features/seller/orders-api";
import type { Permission } from "../../shared/contracts/auth";
import { sellerHistory, sellerTab } from "./tab-history";

const tabs = [
  { path: "/seller", title: "Главная", Icon: House },
  { path: "/seller/orders", title: "Заказы", Icon: Package, permission: "orders" as const },
  { path: "/seller/products", title: "Товары", Icon: Boxes, permission: "products" as const },
  { path: "/seller/more", title: "Ещё", Icon: MoreHorizontal },
];
export function SellerTabs({ store = "", permissions }: { store?: string; permissions?: Permission[] }) {
  const orders = !permissions || permissions.includes("orders") ? store : "";
  const badge = useSellerOrderBadge(orders);
  const router = useRouter();
  const location = useRouterState({ select: (state) => state.location });
  const active = sellerTab(location.pathname);
  useEffect(() => {
    sellerHistory.visit(location.href);
  }, [location.href]);
  return (
    <nav
      aria-label="Кабинет продавца"
      className="fixed bottom-0 left-1/2 z-30 flex w-full max-w-(--content-max) -translate-x-1/2 border-t border-border bg-card pb-(--safe-bottom)"
    >
      {tabs
        .filter(({ permission }) => !permission || !permissions || permissions.includes(permission))
        .map(({ path, title, Icon }) => (
          <button
            key={path}
            type="button"
            aria-current={active === path ? "page" : undefined}
            className={`flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-micro ${active === path ? "text-primary-text" : "text-muted-foreground"}`}
            onClick={async () => {
              sellerHistory.savePosition(location.href, window.scrollY);
              const { href, top } = sellerHistory.destination(path, active);
              const url = new URL(href, window.location.origin);
              for (const key of ["shop", "store"]) {
                const current = key === "store" ? store : new URLSearchParams(location.searchStr).get(key);
                if (current) url.searchParams.set(key, current);
                else url.searchParams.delete(key);
              }
              await router.navigate({ href: url.pathname + url.search, resetScroll: false });
              requestAnimationFrame(() => window.scrollTo({ top, behavior: "instant" }));
            }}
          >
            <span className="relative">
              <Icon size={22} aria-hidden="true" />
              {path === "/seller/orders" && !!badge.data?.count && (
                <span className="absolute -right-2 -top-1 rounded-pill bg-status-danger px-1 text-micro text-status-danger-foreground">
                  {badge.data.count}
                </span>
              )}
            </span>
            {title}
          </button>
        ))}
    </nav>
  );
}
