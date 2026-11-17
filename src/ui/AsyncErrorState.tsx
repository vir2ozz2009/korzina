import { lazy, Suspense } from "react";
import { EmptyState } from "./EmptyState";
import type { ErrorState as ErrorStateType } from "./ErrorState";

type Props = Parameters<typeof ErrorStateType>[0];
function Fallback({ onRetry }: Props) {
  return (
    <div role="alert">
      <EmptyState title="Не удалось загрузить" action={onRetry ? "Повторить" : undefined} onAction={onRetry} />
    </div>
  );
}
const Content = lazy(() =>
  import("./ErrorState").then((module) => ({ default: module.ErrorState })).catch(() => ({ default: Fallback })),
);
export function ErrorState(props: Props) {
  return (
    <Suspense fallback={<Fallback {...props} />}>
      <Content {...props} />
    </Suspense>
  );
}
