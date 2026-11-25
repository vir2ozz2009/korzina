import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import type { SellerOrdersQuery } from "../shared/contracts/seller-order";
import { workdayFocuses } from "../shared/workday-kinds";
import { moneyBack, moneyRoutes } from "./money-routes";
import { rootRoute } from "./root";
import { day, search } from "./seller-route-search";

const sellerScreen = lazyRouteComponent(() => import("../features/seller/ui/CabinetScreen"), "CabinetScreen");
const team = lazyRouteComponent(() => import("../features/seller/ui/team/TeamScreen"), "TeamScreen");
const teamRoutes = [
  ["/seller/team", "Сотрудники"],
  ["/seller/bot", "Бот магазина"],
  ["/seller/notifications", "Уведомления"],
  ["/seller/history", "История действий"],
] as const;
const settings = lazyRouteComponent(
  () => import("../features/seller/ui/settings/SellerSettingsScreen"),
  "SellerSettingsScreen",
);
const settingsRoutes = [
  ["/seller/receiving", "Доставка и самовывоз"],
  ["/seller/hours", "Часы работы"],
  ["/seller/payments", "Оплата"],
  ["/seller/shop-data", "О магазине"],
  ["/seller/shop-color", "Цвет витрины"],
] as const;
const catalog = lazyRouteComponent(
  () => import("../features/seller/ui/catalog/SellerCatalogScreen"),
  "SellerCatalogScreen",
);
const catalogSearch = (
  input: Record<string, unknown>,
): ReturnType<typeof search> & Partial<Record<"back" | "q" | "filter" | "parent" | "category" | "brand", string>> => ({
  ...search(input),
  back: catalogReportBack(input.back),
  ...Object.fromEntries(
    ["q", "filter", "parent", "category", "brand"].flatMap((key) =>
      typeof input[key] === "string" ? [[key, input[key]]] : [],
    ),
  ),
});
function catalogReportBack(input: unknown) {
  return typeof input === "string" && /^\/seller\/statistics\/products\/[^/?#]+(?:\?|$)/u.test(input)
    ? input
    : undefined;
}
const list = lazyRouteComponent(() => import("../features/seller/ui/orders/SellerOrdersList"), "SellerOrdersList");
const order = lazyRouteComponent(() => import("../features/seller/ui/orders/SellerOrderScreen"), "SellerOrderScreen");
const sales = lazyRouteComponent(() => import("../features/seller/ui/sales/SalesScreen"), "SalesScreen");
const salesBack = (input: unknown) =>
  typeof input === "string" && /^\/seller(?:\/statistics(?:\/products)?|\/products)?(?:\?|$)/u.test(input)
    ? input
    : undefined;
const workdayBack = (input: unknown) =>
  typeof input === "string" &&
  /^\/seller(?:\/(?:orders|statistics|workday\/(?:packing|calendar)))?(?:\?|$)/u.test(input)
    ? input
    : undefined;
type WorkdaySearch = ReturnType<typeof search> & {
  day?: string;
  month?: string;
  view?: "day" | "time";
  window?: string;
  purpose?: "packing" | "orders";
  back?: string;
};
const workdaySearch = (input: Record<string, unknown>): WorkdaySearch => ({
  ...search(input),
  day: day(input.day),
  month: typeof input.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/u.test(input.month) ? input.month : undefined,
  view: input.view === "day" ? ("day" as const) : input.view === "time" ? ("time" as const) : undefined,
  window:
    typeof input.window === "string" && /^\d{2}:\d{2}(?:-\d{2}:\d{2})?$/u.test(input.window) ? input.window : undefined,
  purpose: input.purpose === "packing" || input.purpose === "orders" ? input.purpose : undefined,
  back: workdayBack(input.back),
});
const reportSearch = (
  input: Record<string, unknown>,
): ReturnType<typeof search> & {
  from?: string;
  to?: string;
  variant?: string;
  compare?: "0";
  back?: string;
} => ({
  ...search(input),
  from: day(input.from),
  to: day(input.to),
  variant: typeof input.variant === "string" ? input.variant : undefined,
  compare: input.compare === 0 || input.compare === "0" ? ("0" as const) : undefined,
  back: salesBack(input.back),
});
const listSearch = (
  input: Record<string, unknown>,
): ReturnType<typeof search> &
  Partial<Pick<SellerOrdersQuery, "tab" | "method" | "debt" | "day" | "focus" | "completedFrom" | "completedTo">> & {
    back?: string;
  } => ({
  ...search(input),
  tab: input.tab === "active" || input.tab === "completed" ? input.tab : undefined,
  day: day(input.day),
  completedFrom: day(input.completedFrom),
  completedTo: day(input.completedTo),
  focus: workdayFocuses.find((value) => value === input.focus),
  back: workdayBack(input.back),
  method: input.method === "pickup" || input.method === "delivery" ? input.method : undefined,
  debt: input.debt === 1 || input.debt === "1" ? ("1" as const) : undefined,
});
const orderSearch = (
  input: Record<string, unknown>,
): ReturnType<typeof search> & { back?: string; action?: "next" | "packing" | "payment" | "receipt" } => ({
  ...search(input),
  back: workdayBack(input.back) ?? moneyBack(input.back),
  action:
    input.action === "next" || input.action === "packing" || input.action === "payment" || input.action === "receipt"
      ? input.action
      : undefined,
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
const chat = lazyRouteComponent(() => import("../features/seller/ui/orders/SellerChatScreen"), "SellerChatScreen");
export const sellerRoutes = [
  ...moneyRoutes,
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/seller/statistics",
    validateSearch: reportSearch,
    staticData: { template: "list", transition: "push", title: "Статистика" },
    component: sales,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/seller/statistics/products",
    validateSearch: reportSearch,
    staticData: { template: "list", transition: "push", title: "Статистика продаж" },
    component: sales,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/seller/statistics/products/$id",
    validateSearch: reportSearch,
    staticData: { template: "list", transition: "push", title: "Статистика товара" },
    component: sales,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/seller/inbox",
    validateSearch: search,
    staticData: { template: "list", transition: "push", title: "Переписка по заказам" },
    component: chat,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/seller/orders/$number/chat",
    validateSearch: search,
    staticData: { template: "feedback", transition: "push", title: "Чат по заказу" },
    component: chat,
  }),
  ...teamRoutes.map(([path, title]) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path,
      validateSearch: search,
      staticData: { template: "list", transition: "push", title },
      component: team,
    }),
  ),
  ...settingsRoutes.map(([path, title]) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path,
      validateSearch: search,
      staticData: { template: "form", transition: "push", title },
      component: settings,
    }),
  ),
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
    path: "/seller/workday/packing",
    validateSearch: workdaySearch,
    staticData: { template: "list", transition: "push", title: "Список сборки" },
    component: lazyRouteComponent(() => import("../features/seller/ui/workday/WorkdayScreens"), "PackingScreen"),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/seller/workday/calendar",
    validateSearch: workdaySearch,
    staticData: { template: "list", transition: "push", title: "Календарь" },
    component: lazyRouteComponent(() => import("../features/seller/ui/workday/WorkdayScreens"), "OrderCalendarScreen"),
  }),
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
