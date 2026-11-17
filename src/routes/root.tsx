import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext } from "@tanstack/react-router";
import { AppShell } from "../app/shell/AppShell";
import { Header } from "../app/shell/Header";
import { Screen } from "../app/shell/Screen";
import { ErrorState } from "../ui/AsyncErrorState";
import { EmptyState } from "../ui/EmptyState";

export const rootRoute = createRootRouteWithContext<{ qc: QueryClient }>()({
  validateSearch: (search: Record<string, unknown>): { shop?: string } => ({
    shop: typeof search.shop === "string" ? search.shop : undefined,
  }),
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
