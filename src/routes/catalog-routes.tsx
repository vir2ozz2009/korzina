import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { TemplatePending } from "../app/templates/TemplatePending";
import { readFilterParams } from "../features/catalog/filter-params";
import type { CatalogFilters } from "../shared/contracts/catalog-list";
import { rootRoute } from "./root";

function catalogSearch(search: Record<string, unknown>): CatalogFilters & { subcategory?: string; variants?: string } {
  return {
    ...readFilterParams(search),
    subcategory: typeof search.subcategory === "string" ? search.subcategory : undefined,
    variants: typeof search.variants === "string" ? search.variants : undefined,
  };
}
const allProducts = createRoute({
  getParentRoute: () => rootRoute,
  path: "/catalog",
  validateSearch: catalogSearch,
  staticData: { template: "catalog", transition: "tab", title: "Все товары" },
  component: lazyRouteComponent(() => import("../features/catalog/ui/AllProductsScreen"), "AllProductsScreen"),
  pendingComponent: () => <TemplatePending template="catalog" />,
});
const search = createRoute({
  getParentRoute: () => rootRoute,
  path: "/search",
  validateSearch: (input: Record<string, unknown>): CatalogFilters & { q?: string; variants?: string } => ({
    ...catalogSearch(input),
    q: typeof input.q === "string" ? input.q.slice(0, 180) : undefined,
  }),
  staticData: { template: "catalog", transition: "push", title: "Нейропоиск" },
  component: lazyRouteComponent(() => import("../features/catalog/ui/SearchScreen"), "SearchScreen"),
});
const category = createRoute({
  getParentRoute: () => rootRoute,
  path: "/c/$id",
  validateSearch: catalogSearch,
  staticData: { template: "catalog", transition: "push", title: "Категория" },
  component: lazyRouteComponent(() => import("../features/catalog/ui/CategoryScreen"), "CategoryScreen"),
  pendingComponent: () => <TemplatePending template="catalog" />,
});
const brand = createRoute({
  getParentRoute: () => rootRoute,
  path: "/b/$id",
  validateSearch: catalogSearch,
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
export const catalogRoutes = [allProducts, search, category, brand, categories, brands];
