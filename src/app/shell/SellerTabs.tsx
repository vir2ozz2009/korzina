import { useRouter, useRouterState } from "@tanstack/react-router";
import { House, ListOrdered, Menu, Package, Wallet } from "lucide-react";
import { useEffect } from "react";

import { sellerHistory, sellerTab } from "./tab-history";

const tabs = [
  { path: "/seller", title: "Главная", Icon: House },
  { path: "/seller/orders", title: "Заказы", Icon: ListOrdered },
  { path: "/seller/products", title: "Товары", Icon: Package },
  { path: "/seller/money", title: "Деньги", Icon: Wallet },
  { path: "/seller/more", title: "Ещё", Icon: Menu },
];
export function SellerTabs() {
  const router = useRouter();
  const location = useRouterState({ select: (state) => state.location });
  const active = sellerTab(location.pathname);
  useEffect(() => {
    sellerHistory.visit(location.href);
  }, [location.href]);
  return (
    <nav
      aria-label="Кабинет"
      className="fixed bottom-0 left-1/2 z-30 w-full max-w-(--content-max) -translate-x-1/2 pb-(--safe-bottom) grid grid-cols-5 border-t border-border bg-card"
    >
      {tabs.map(({ path, title, Icon }) => (
        <button
          key={path}
          type="button"
          aria-current={active === path ? "page" : undefined}
          className={`flex min-h-16 flex-col items-center justify-center gap-1 text-micro ${active === path ? "text-primary-text" : "text-muted-foreground"}`}
          onClick={async () => {
            sellerHistory.savePosition(location.href, window.scrollY);
            const { href, top } = sellerHistory.destination(path, active);
            await router.navigate({ to: href, resetScroll: false });
            requestAnimationFrame(() => window.scrollTo({ top, behavior: "instant" }));
          }}
        >
          <Icon size={22} />
          {title}
        </button>
      ))}
    </nav>
  );
}
