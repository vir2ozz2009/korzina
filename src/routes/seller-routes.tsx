import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { TemplatePending } from "../app/templates/TemplatePending";
import { rootRoute } from "./root";

const screen = lazyRouteComponent(() => import("../features/demo/ui/SellerScreens"), "SellerScreen");
const tabRoutes = (
  [
    ["/seller", "Главная"],
    ["/seller/orders", "Заказы"],
    ["/seller/products", "Товары"],
    ["/seller/money", "Деньги"],
    ["/seller/more", "Ещё"],
  ] as const
).map(([path, title]) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path,
    staticData: { template: path === "/seller" ? "home" : "list", transition: "tab", title, root: true },
    component: screen,
    pendingComponent: () => <TemplatePending template={path === "/seller" ? "home" : "list"} />,
  }),
);
const orderRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/seller/orders/demo",
  staticData: { template: "order", transition: "push", title: "Заказ №1042" },
  component: lazyRouteComponent(() => import("../features/demo/ui/SellerScreens"), "SellerOrder"),
  pendingComponent: () => <TemplatePending template="order" />,
});
export const sellerRoutes = [...tabRoutes, orderRoute];
