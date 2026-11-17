import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { TemplatePending } from "../app/templates/TemplatePending";
import { rootRoute } from "./root";

const kit = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dev/kit",
  staticData: { transition: "push", title: "UI-кит", template: "list" },
  component: lazyRouteComponent(() => import("../app/dev/UiKit"), "UiKit"),
  pendingComponent: () => <TemplatePending template="list" />,
});
const media = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dev/media",
  staticData: { transition: "push", title: "Фото и файлы", template: "form" },
  component: lazyRouteComponent(() => import("../features/media/ui/MediaScreen"), "MediaScreen"),
  pendingComponent: () => <TemplatePending template="form" />,
});
export const devRoutes = [kit, media];
