import { type ComponentProps, lazy, Suspense } from "react";
import { SkeletonBlock } from "./SkeletonBlock";
import { useDeferredOpen } from "./useDeferredOpen";

const Content = lazy(() => import("./SheetContent").then((module) => ({ default: module.SheetContent })));

export function Sheet(props: ComponentProps<typeof Content>) {
  const activated = useDeferredOpen(props.open);
  if (!props.open && !activated) return null;
  return (
    <Suspense fallback={<SkeletonBlock className="fixed inset-0 z-50" />}>
      <Content {...props} />
    </Suspense>
  );
}
