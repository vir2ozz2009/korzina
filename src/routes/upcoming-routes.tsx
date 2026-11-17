import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { rootRoute } from "./root";

const component = lazyRouteComponent(() => import("../features/catalog/ui/UpcomingScreen"), "UpcomingScreen");
function upcoming<const Path extends string>(path: Path, title: string) {
  return createRoute({
    getParentRoute: () => rootRoute,
    path,
    staticData: { template: "catalog", transition: "push", title },
    component,
  });
}
export const upcomingRoutes = [
  upcoming("/addresses", "Адрес доставки"),
  upcoming("/chat", "Чат с магазином"),
  upcoming("/login", "Вход"),
  upcoming("/brands", "Бренды"),
  upcoming("/search", "Поиск"),
  upcoming("/all", "Каталог"),
  upcoming("/c/$id", "Категория"),
  upcoming("/b/$id", "Бренд"),
];
