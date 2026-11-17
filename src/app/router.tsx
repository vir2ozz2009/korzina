import { createRouter } from "@tanstack/react-router";
import { rootRoute } from "../routes/root";
import { createQueryClient } from "./query-defaults";

export const queryClient = createQueryClient();
// Compile-time boundary: production never emits these screens or their imports.
const routes = import.meta.env.DEV_SCREENS ? (await import("../routes/dev-routes")).devRoutes : [];
export const router = createRouter({
  routeTree: rootRoute.addChildren(routes),
  context: { qc: queryClient },
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
  defaultPendingMs: 150,
  defaultPendingMinMs: 300,
  scrollRestoration: true,
  getScrollRestorationKey: (location) => location.pathname + location.searchStr,
});
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
