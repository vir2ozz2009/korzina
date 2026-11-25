import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { rootRoute } from "./root";
import { search } from "./seller-route-search";
export function promoBack(input: unknown) {
  return typeof input === "string" && /^\/seller\/promotions(?:\/[^/?#]+)?(?:\?|$)/u.test(input) ? input : undefined;
}
export const promotionRoutes = [
  ...(["/seller/promotions", "/seller/promotions/$id"] as const).map((path) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path,
      validateSearch: search,
      staticData: { template: "list", transition: "push", title: "Продвижение" },
      component: lazyRouteComponent(() => import("../features/seller/ui/promo/PromoScreen"), "PromoScreen"),
    }),
  ),
];
