import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, lazyRouteComponent } from "@tanstack/react-router";
import { AppShell } from "../app/shell/AppShell";
export const rootRoute = createRootRouteWithContext<{ qc: QueryClient }>()({
  validateSearch: (search: Record<string, unknown>): { shop?: string } => ({
    shop: typeof search.shop === "string" ? search.shop : undefined,
  }),
  component: AppShell,
  notFoundComponent: lazyRouteComponent(() => import("../app/shell/RouteNotFound"), "RouteNotFound"),
  errorComponent: lazyRouteComponent(() => import("../app/shell/RouteError"), "RouteError"),
});
