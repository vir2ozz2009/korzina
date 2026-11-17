import { createRoute, createRouter, lazyRouteComponent } from "@tanstack/react-router";
import { demoRoutes } from "../routes/demo-routes";
import { rootRoute } from "../routes/root";
import { sellerRoutes } from "../routes/seller-routes";
import { shopRoutes } from "../routes/shop-routes";
import { createQueryClient } from "./query-defaults";
import { TemplatePending } from "./templates/TemplatePending";

export const queryClient = createQueryClient();
const kit = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dev/kit",
  staticData: { transition: "push", title: "UI-кит", template: "list" },
  component: lazyRouteComponent(() => import("./dev/UiKit")),
  pendingComponent: () => <TemplatePending template="list" />,
});
const admin = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin",
  staticData: { transition: "none", title: "Платформа", template: "list", root: true },
  component: lazyRouteComponent(() => import("../features/demo/ui/AdminScreen"), "AdminScreen"),
  pendingComponent: () => <TemplatePending template="list" />,
});
const media = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dev/media",
  staticData: { transition: "push", title: "Фото и файлы", template: "form" },
  component: lazyRouteComponent(() => import("../features/media/ui/MediaScreen"), "MediaScreen"),
  pendingComponent: () => <TemplatePending template="form" />,
});
export const router = createRouter({
  routeTree: rootRoute.addChildren([...shopRoutes, ...sellerRoutes, ...demoRoutes, kit, admin, media]),
  context: { qc: queryClient },
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
  defaultPendingMs: 150,
  defaultPendingMinMs: 300,
  scrollRestoration: true,
  getScrollRestorationKey: (location) => location.pathname + location.searchStr,
});
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
