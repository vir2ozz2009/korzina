import { lazy, Suspense } from "react";
import type { ErrorState as ErrorStateType } from "./ErrorState";

const Content = lazy(() => import("./ErrorState").then((module) => ({ default: module.ErrorState })));
export function ErrorState(props: Parameters<typeof ErrorStateType>[0]) {
  return (
    <Suspense fallback={null}>
      <Content {...props} />
    </Suspense>
  );
}
