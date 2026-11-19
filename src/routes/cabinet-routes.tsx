import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { rootRoute } from "./root";

const sellerScreen = lazyRouteComponent(() => import("../features/seller/ui/CabinetScreen"), "CabinetScreen");
const search = (input: Record<string, unknown>): { store?: string } => ({
  store: typeof input.store === "string" && /^[a-z0-9-]{1,63}$/.test(input.store) ? input.store : undefined,
});
export const sellerRoutes = [
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/seller",
    validateSearch: search,
    staticData: { template: "form", transition: "tab", title: "Кабинет продавца", root: true },
    component: sellerScreen,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/seller/more",
    validateSearch: search,
    staticData: { template: "list", transition: "tab", title: "Ещё", root: true },
    component: sellerScreen,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/seller/profile",
    validateSearch: search,
    staticData: { template: "form", transition: "push", title: "Профиль продавца" },
    component: sellerScreen,
  }),
];
