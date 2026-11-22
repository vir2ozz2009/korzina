import { useRouter, useRouterState } from "@tanstack/react-router";
import { canGoBack } from "./navigation";

export function useBack(fallback = "/") {
  const router = useRouter();
  const index = useRouterState({ select: (state) => state.location.state.__TSR_index });
  return () => {
    const href = router.state.location.href;
    if (href.startsWith("/seller")) {
      void import("./tab-history").then(async ({ sellerHistory, sellerTab }) => {
        const explicit = router.state.location.search.back;
        const targetHref = typeof explicit === "string" ? explicit : undefined;
        if (!targetHref && router.state.location.pathname === sellerTab(href)) return;
        const target = new URL(targetHref ?? sellerHistory.back(href), window.location.origin);
        if (target.origin !== window.location.origin) return;
        const current = new URL(href, window.location.origin);
        for (const key of ["shop", "store"]) {
          const value = current.searchParams.get(key);
          if (value && !target.searchParams.has(key)) target.searchParams.set(key, value);
        }
        const destination = target.pathname + target.search;
        await router.navigate({ href: destination, replace: true, resetScroll: false });
        requestAnimationFrame(() => window.scrollTo({ top: sellerHistory.position(destination), behavior: "instant" }));
      });
      return;
    }
    if (canGoBack(index)) router.history.back();
    else void router.navigate({ to: fallback, search: (previous) => ({ shop: previous.shop }), replace: true });
  };
}
