import type { ReactNode } from "react";
import { EmptyState } from "../../ui/EmptyState";
import { ErrorState } from "../../ui/ErrorState";
import { TemplateSkeleton } from "../templates/TemplateSkeleton";
import type { TemplateName } from "../templates/types";
import { useLoadingGate } from "./useLoadingGate";

export interface QueryResult<T> {
  data: T | undefined;
  isPending: boolean;
  isError: boolean;
  refetch: () => unknown;
}
export function QueryBoundary<T>({
  query,
  template,
  children,
  isEmpty,
  emptyAction,
}: {
  query: QueryResult<T>;
  template: TemplateName;
  children: (data: T) => ReactNode;
  isEmpty?: (data: T) => boolean;
  emptyAction?: () => void;
}) {
  const pending = query.isPending && query.data === undefined;
  const gate = useLoadingGate(pending);
  if (gate.waiting) return <div aria-busy="true">{gate.visible ? <TemplateSkeleton template={template} /> : null}</div>;
  if (query.isError && query.data === undefined) return <ErrorState onRetry={() => void query.refetch()} />;
  if (query.data === undefined || isEmpty?.(query.data))
    return (
      <EmptyState
        title="Пока ничего нет"
        description="Здесь появятся данные магазина."
        action={emptyAction ? "На главную" : undefined}
        onAction={emptyAction}
      />
    );
  return <div className="content-reveal">{children(query.data)}</div>;
}
