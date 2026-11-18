import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { TemplatePending } from "../app/templates/TemplatePending";
import { catalogRoutes } from "./catalog-routes";
import { rootRoute } from "./root";

const variantsSearch = (search: Record<string, unknown>): { variants?: string } => ({
  variants: typeof search.variants === "string" ? search.variants : undefined,
});
const home = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  validateSearch: variantsSearch,
  staticData: { template: "home", transition: "tab", title: "Магазин", root: true },
  component: lazyRouteComponent(() => import("../features/catalog/ui/HomeScreen"), "HomeScreen"),
  pendingComponent: () => <TemplatePending template="home" />,
});
const product = createRoute({
  getParentRoute: () => rootRoute,
  path: "/p/$id",
  validateSearch: variantsSearch,
  staticData: { template: "product", transition: "push", title: "Товар" },
  component: lazyRouteComponent(() => import("../features/catalog/ui/ProductScreen"), "ProductScreen"),
  pendingComponent: () => <TemplatePending template="product" />,
});
const details = createRoute({
  getParentRoute: () => product,
  path: "details",
  staticData: { template: "feedback", transition: "sheet", title: "Подробнее о товаре" },
  component: lazyRouteComponent(() => import("../features/catalog/ui/DetailsScreen"), "DetailsScreen"),
});
const about = createRoute({
  getParentRoute: () => rootRoute,
  path: "/about",
  staticData: { template: "form", transition: "push", title: "О магазине" },
  component: lazyRouteComponent(() => import("../features/catalog/ui/AboutScreen"), "AboutScreen"),
});
const cart = createRoute({
  getParentRoute: () => rootRoute,
  path: "/cart",
  staticData: { template: "checkout", transition: "push", title: "Корзина" },
  component: lazyRouteComponent(() => import("../features/cart/ui/CartScreen"), "CartScreen"),
});
export const shopRoutes = [home, product.addChildren([details]), about, cart, ...catalogRoutes];
