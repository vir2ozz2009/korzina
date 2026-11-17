import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { TemplatePending } from "../app/templates/TemplatePending";
import { demoRoutes } from "./demo-routes";
import { rootRoute } from "./root";
import { sellerRoutes } from "./seller-routes";
import { shopRoutes } from "./shop-routes";

const kit = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dev/kit",
  staticData: { transition: "push", title: "UI-кит", template: "list" },
  component: lazyRouteComponent(() => import("../app/dev/UiKit"), "UiKit"),
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
export const devRoutes = [...shopRoutes, ...sellerRoutes, ...demoRoutes, kit, admin, media];
