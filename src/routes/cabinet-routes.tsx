import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { rootRoute } from "./root";

const sellerScreen = lazyRouteComponent(() => import("../features/seller/ui/CabinetScreen"), "CabinetScreen");
const search = (input: Record<string, unknown>): { store?: string } => ({
  store: typeof input.store === "string" && /^[a-z0-9-]{1,63}$/.test(input.store) ? input.store : undefined,
});
const catalog = lazyRouteComponent(
  () => import("../features/seller/ui/catalog/SellerCatalogScreen"),
  "SellerCatalogScreen",
);
const catalogSearch = (input: Record<string, unknown>) => ({
  ...search(input),
  ...Object.fromEntries(
    ["q", "filter", "parent", "category", "brand"].flatMap((key) =>
      typeof input[key] === "string" ? [[key, input[key]]] : [],
    ),
  ),
});
const list = lazyRouteComponent(() => import("../features/seller/ui/orders/SellerOrdersList"), "SellerOrdersList");
const order = lazyRouteComponent(() => import("../features/seller/ui/orders/SellerOrderScreen"), "SellerOrderScreen");
const listSearch = (
  input: Record<string, unknown>,
): ReturnType<typeof search> & {
  tab?: "active" | "completed";
  method?: "pickup" | "delivery";
  debt?: "1";
} => ({
  ...search(input),
  tab: input.tab === "active" || input.tab === "completed" ? input.tab : undefined,
  method: input.method === "pickup" || input.method === "delivery" ? input.method : undefined,
  debt: input.debt === 1 || input.debt === "1" ? ("1" as const) : undefined,
});
const orderSearch = (input: Record<string, unknown>) => ({
  ...search(input),
  action: input.action === "next" || input.action === "packing" ? input.action : undefined,
});
const catalogRoutes = [
  ["/seller/products", "Товары", true],
  ["/seller/products/new", "Новый товар", false],
  ["/seller/products/$id", "Редактировать товар", false],
  ["/seller/categories", "Категории", true],
  ["/seller/categories/new", "Новая категория", false],
  ["/seller/categories/$id", "Редактировать категорию", false],
  ["/seller/brands", "Бренды", true],
  ["/seller/brands/new", "Новый бренд", false],
  ["/seller/brands/$id", "Редактировать бренд", false],
  ["/seller/showcase", "Витрина", false],
] as const;
export const sellerRoutes = [
  ...catalogRoutes.map(([path, title, root]) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path,
      validateSearch: catalogSearch,
      staticData: { template: root ? "list" : "form", transition: root ? "tab" : "push", title, root },
      component: catalog,
    }),
  ),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/seller/orders",
    validateSearch: listSearch,
    staticData: { template: "list", transition: "tab", title: "Заказы", root: true },
    component: list,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/seller/orders/$number",
    validateSearch: orderSearch,
    staticData: { template: "order", transition: "push", title: "Заказ" },
    component: order,
  }),
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
