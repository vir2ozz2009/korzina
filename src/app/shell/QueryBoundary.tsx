import type { ReactNode } from "react";
import { errorKind } from "../../shared/http-error";
import { EmptyState } from "../../ui/EmptyState";
import { ErrorState } from "../../ui/ErrorState";
import { StorefrontState } from "../../ui/StorefrontState";
import { TemplateSkeleton } from "../templates/TemplateSkeleton";
import type { TemplateName } from "../templates/types";
import { useLoadingGate } from "./useLoadingGate";

export interface QueryResult<T> {
  data: T | undefined;
  isPending: boolean;
  isFetching?: boolean;
  isError: boolean;
  error?: unknown;
  refetch: () => unknown;
}
export function QueryBoundary<T>({
  query,
  template,
  children,
  isEmpty,
  emptyAction,
  emptyTitle = "Пока ничего нет",
  emptyDescription = "Здесь появятся данные магазина.",
}: {
  query: QueryResult<T>;
  template: TemplateName;
  children: (data: T) => ReactNode;
  isEmpty?: (data: T) => boolean;
  emptyAction?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const pending = query.isPending && query.data === undefined;
  const gate = useLoadingGate(pending);
  if (gate.waiting) return <div aria-busy="true">{gate.visible ? <TemplateSkeleton template={template} /> : null}</div>;
  if (query.isError && (query.data === undefined || errorKind(query.error) === "access"))
    return template === "home" ? (
      <StorefrontState state="error" onRetry={() => void query.refetch()} />
    ) : (
      <ErrorState error={query.error} onRetry={() => void query.refetch()} />
    );
  if (query.data === undefined || isEmpty?.(query.data))
    return template === "home" ? (
      <StorefrontState state="empty" />
    ) : (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction ? "На главную" : undefined}
        onAction={emptyAction}
      />
    );
  return <div className="content-reveal space-y-3">{children(query.data)}</div>;
}
