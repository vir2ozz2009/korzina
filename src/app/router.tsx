import { createRoute, createRouter, lazyRouteComponent } from "@tanstack/react-router";
import { sellerRoutes } from "../routes/cabinet-routes";
import { rootRoute } from "../routes/root";
import { shopRoutes } from "../routes/shop-routes";
import { createQueryClient } from "./query-defaults";
import { TemplatePending } from "./templates/TemplatePending";

export const queryClient = createQueryClient();
// Compile-time boundary: production never emits these screens or their imports.
const routes = import.meta.env.DEV_SCREENS ? createDevRoutes() : [];
export const router = createRouter({
  routeTree: rootRoute.addChildren([...shopRoutes, ...sellerRoutes, ...routes]),
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

function createDevRoutes() {
  const kit = createRoute({
    getParentRoute: () => rootRoute,
    path: "/dev/kit",
    staticData: { transition: "push", title: "UI-кит", template: "list" },
    component: lazyRouteComponent(() => import("./dev/UiKit"), "UiKit"),
    pendingComponent: () => <TemplatePending template="list" />,
  });
  const media = createRoute({
    getParentRoute: () => rootRoute,
    path: "/dev/media",
    staticData: { transition: "push", title: "Фото и файлы", template: "form" },
    component: lazyRouteComponent(() => import("../features/media/ui/MediaScreen"), "MediaScreen"),
    pendingComponent: () => <TemplatePending template="form" />,
  });
  return [kit, media];
}
