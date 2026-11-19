import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { rootRoute } from "./root";

export const adminRoutes = [
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/admin",
    staticData: { template: "list", transition: "push", title: "Админка" },
    component: lazyRouteComponent(() => import("../features/admin/ui/RegistryScreen"), "RegistryScreen"),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/admin/shops/$id",
    staticData: { template: "order", transition: "push", title: "Магазин" },
    component: lazyRouteComponent(() => import("../features/admin/ui/AdminShopScreen"), "AdminShopScreen"),
  }),
];
