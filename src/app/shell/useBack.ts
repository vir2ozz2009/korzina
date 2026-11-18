import { useRouter, useRouterState } from "@tanstack/react-router";
import { canGoBack } from "./navigation";

export function useBack(fallback = "/") {
  const router = useRouter();
  const index = useRouterState({ select: (state) => state.location.state.__TSR_index });
  return () => {
    const href = router.state.location.href;
    if (href.startsWith("/seller")) {
      void import("./tab-history").then(({ sellerHistory, sellerTab }) => {
        if (router.state.location.pathname !== sellerTab(href))
          void router.navigate({ to: sellerHistory.back(href), replace: true });
      });
      return;
    }
    if (canGoBack(index)) router.history.back();
    else void router.navigate({ to: fallback, search: (previous) => ({ shop: previous.shop }), replace: true });
  };
}
