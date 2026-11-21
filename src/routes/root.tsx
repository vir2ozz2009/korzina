import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, retainSearchParams } from "@tanstack/react-router";
import { AppShell } from "../app/shell/AppShell";
import { Header } from "../app/shell/Header";
import { Screen } from "../app/shell/Screen";
import { ErrorState } from "../ui/AsyncErrorState";
import { EmptyState } from "../ui/EmptyState";

export const rootRoute = createRootRouteWithContext<{ qc: QueryClient }>()({
  validateSearch: (search: Record<string, unknown>): { shop?: string; viewer?: "team"; telegram?: "1" } => ({
    shop: typeof search.shop === "string" ? search.shop : undefined,
    viewer: search.viewer === "team" ? "team" : undefined,
    telegram: search.telegram === "1" || search.telegram === 1 ? "1" : undefined,
  }),
  search: { middlewares: [retainSearchParams(["shop", "viewer", "telegram"])] },
  component: AppShell,
  notFoundComponent: () => (
    <Screen header={<Header title="Страница не найдена" />}>
      <EmptyState
        title="Такой страницы нет"
        action="На главную"
        onAction={() => {
          location.href = "/";
        }}
      />
    </Screen>
  ),
  errorComponent: ({ reset }) => (
    <Screen header={<Header title="Ошибка" />}>
      <ErrorState onRetry={reset} />
    </Screen>
  ),
});
