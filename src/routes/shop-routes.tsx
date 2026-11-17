import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { TemplatePending } from "../app/templates/TemplatePending";
import { demoQuery, demoSearch } from "../features/demo/api";
import { rootRoute } from "./root";

const home = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  validateSearch: demoSearch,
  staticData: { template: "home", transition: "tab", title: "Korzina", root: true },
  loaderDeps: ({ search }) => ({ simulate: search.simulate }),
  loader: ({ context, deps }) => context.qc.ensureQueryData(demoQuery("home", deps.simulate)).catch(() => undefined),
  component: lazyRouteComponent(() => import("../features/demo/ui/ShopScreens"), "ShopHome"),
  pendingComponent: () => <TemplatePending template="home" />,
});
const product = createRoute({
  getParentRoute: () => rootRoute,
  path: "/p/demo",
  validateSearch: demoSearch,
  staticData: { template: "product", transition: "push", title: "Томаты на ветке" },
  loaderDeps: ({ search }) => ({ simulate: search.simulate }),
  loader: ({ context, deps }) => context.qc.ensureQueryData(demoQuery("product", deps.simulate)).catch(() => undefined),
  component: lazyRouteComponent(() => import("../features/demo/ui/ShopScreens"), "DemoProduct"),
  pendingComponent: () => <TemplatePending template="product" />,
});
const details = createRoute({
  getParentRoute: () => product,
  path: "details",
  staticData: { template: "feedback", transition: "sheet", title: "Подробнее о товаре" },
  component: lazyRouteComponent(() => import("../features/demo/ui/DetailsScreen"), "DetailsScreen"),
  pendingComponent: () => <TemplatePending template="feedback" />,
});
export const shopRoutes = [home, product.addChildren([details])];
