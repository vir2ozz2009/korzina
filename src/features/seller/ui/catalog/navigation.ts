import { useRouter, useRouterState } from "@tanstack/react-router";
import { sellerHistory } from "../../../../app/shell/tab-history";

export function useCatalogNav(store?: string) {
  const router = useRouter();
  const location = useRouterState({ select: (state) => state.location });
  const params = new URLSearchParams(location.searchStr);
  function href(path: string, query: Record<string, string | undefined> = {}) {
    const next = new URLSearchParams();
    const shop = params.get("shop");
    if (shop) next.set("shop", shop);
    if (store) next.set("store", store);
    for (const [key, value] of Object.entries(query)) if (value) next.set(key, value);
    return next.size ? `${path}?${next}` : path;
  }
  function open(path: string, query?: Record<string, string | undefined>, replace = false, ignoreBlocker = false) {
    sellerHistory.savePosition(location.href, window.scrollY);
    void router.navigate({ href: href(path, query), replace, ignoreBlocker });
  }
  function leave(fallback: string, ignoreBlocker = false) {
    const destination = sellerHistory.back(location.href);
    const next = destination === "/seller/products" || destination === "/seller/more" ? href(fallback) : destination;
    void router
      .navigate({ href: next, replace: true, ignoreBlocker, resetScroll: false })
      .then(() =>
        requestAnimationFrame(() => window.scrollTo({ top: sellerHistory.position(next), behavior: "instant" })),
      );
  }
  return { location, params, href, open, leave };
}
