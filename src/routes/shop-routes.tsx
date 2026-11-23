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
  validateSearch: (search: Record<string, unknown>): { variants?: string; variant?: string } => ({
    ...variantsSearch(search),
    variant: typeof search.variant === "string" ? search.variant : undefined,
  }),
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
const receiving = createRoute({
  getParentRoute: () => rootRoute,
  path: "/checkout/receiving",
  staticData: { template: "checkout", transition: "push", title: "Получение" },
  component: lazyRouteComponent(() => import("../features/receiving/ui/ReceivingScreen"), "ReceivingScreen"),
});
const payment = createRoute({
  getParentRoute: () => rootRoute,
  path: "/checkout/payment",
  staticData: { template: "checkout", transition: "push", title: "Оплата" },
  component: lazyRouteComponent(() => import("../features/checkout/ui/PaymentScreen"), "PaymentScreen"),
});
const done = createRoute({
  getParentRoute: () => rootRoute,
  path: "/checkout/done",
  validateSearch: (search: Record<string, unknown>): { order?: number } => ({
    order: Number.isSafeInteger(Number(search.order)) && Number(search.order) > 0 ? Number(search.order) : undefined,
  }),
  staticData: { template: "feedback", transition: "push", title: "Готово" },
  component: lazyRouteComponent(() => import("../features/checkout/ui/DoneScreen"), "DoneScreen"),
});
const orderHistory = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orders",
  staticData: { template: "list", transition: "push", title: "Мои заказы" },
  component: lazyRouteComponent(() => import("../features/orders/ui/OrderListScreen"), "OrderListScreen"),
});
const buyerOrder = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orders/$number",
  staticData: { template: "order", transition: "push", title: "Заказ" },
  component: lazyRouteComponent(() => import("../features/orders/ui/OrderScreen"), "OrderScreen"),
});
const buyerChanges = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orders/$number/changes",
  staticData: { template: "order", transition: "push", title: "В заказе изменения" },
  component: lazyRouteComponent(() => import("../features/orders/ui/BuyerChangesScreen"), "BuyerChangesScreen"),
});
const buyerChatList = createRoute({
  getParentRoute: () => rootRoute,
  path: "/chats",
  staticData: { template: "list", transition: "push", title: "Переписки" },
  component: lazyRouteComponent(() => import("../features/order-chat/ui/ChatScreens"), "BuyerInbox"),
});
const buyerChat = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orders/$number/chat",
  staticData: { template: "feedback", transition: "push", title: "Чат с магазином" },
  component: lazyRouteComponent(() => import("../features/order-chat/ui/ChatScreens"), "BuyerChatScreen"),
});
const favorites = createRoute({
  getParentRoute: () => rootRoute,
  path: "/favorites",
  staticData: { template: "catalog", transition: "push", title: "Избранное" },
  component: lazyRouteComponent(() => import("../features/favorites/ui/FavoritesScreen"), "FavoritesScreen"),
});
const profile = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profile",
  staticData: { template: "form", transition: "push", title: "Профиль" },
  component: lazyRouteComponent(() => import("../features/profile/ui/ProfileScreen"), "ProfileScreen"),
});
const personalData = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profile/data",
  staticData: { template: "form", transition: "push", title: "Мои данные" },
  component: lazyRouteComponent(() => import("../features/profile/ui/PersonalDataScreen"), "PersonalDataScreen"),
});
const addresses = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profile/addresses",
  staticData: { template: "list", transition: "push", title: "Мои адреса" },
  component: lazyRouteComponent(() => import("../features/profile/ui/AddressesScreen"), "AddressesScreen"),
});
export const shopRoutes = [
  home,
  product.addChildren([details]),
  about,
  cart,
  receiving,
  payment,
  done,
  orderHistory,
  buyerOrder,
  buyerChanges,
  buyerChatList,
  buyerChat,
  favorites,
  profile,
  personalData,
  addresses,
  ...catalogRoutes,
];
