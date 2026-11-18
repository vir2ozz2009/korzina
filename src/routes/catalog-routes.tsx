import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { TemplatePending } from "../app/templates/TemplatePending";
import { rootRoute } from "./root";

const category = createRoute({
  getParentRoute: () => rootRoute,
  path: "/c/$id",
  validateSearch: (search: Record<string, unknown>): { subcategory?: string; variants?: string } => ({
    subcategory: typeof search.subcategory === "string" ? search.subcategory : undefined,
    variants: typeof search.variants === "string" ? search.variants : undefined,
  }),
  staticData: { template: "catalog", transition: "push", title: "Категория" },
  component: lazyRouteComponent(() => import("../features/catalog/ui/CategoryScreen"), "CategoryScreen"),
  pendingComponent: () => <TemplatePending template="catalog" />,
});
const brand = createRoute({
  getParentRoute: () => rootRoute,
  path: "/b/$id",
  validateSearch: (search: Record<string, unknown>): { variants?: string } => ({
    variants: typeof search.variants === "string" ? search.variants : undefined,
  }),
  staticData: { template: "catalog", transition: "push", title: "Бренд" },
  component: lazyRouteComponent(() => import("../features/catalog/ui/BrandScreen"), "BrandScreen"),
  pendingComponent: () => <TemplatePending template="catalog" />,
});
const categories = createRoute({
  getParentRoute: () => rootRoute,
  path: "/categories",
  staticData: { template: "catalog", transition: "push", title: "Все категории" },
  component: lazyRouteComponent(() => import("../features/catalog/ui/NavigationScreen"), "NavigationScreen"),
});
const brands = createRoute({
  getParentRoute: () => rootRoute,
  path: "/brands",
  staticData: { template: "catalog", transition: "push", title: "Бренды" },
  component: lazyRouteComponent(() => import("../features/catalog/ui/NavigationScreen"), "BrandsScreen"),
});
export const catalogRoutes = [category, brand, categories, brands];
