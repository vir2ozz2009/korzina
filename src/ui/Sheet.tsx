import { type ComponentProps, lazy, Suspense } from "react";
import { SkeletonBlock } from "./SkeletonBlock";
import { useDeferredOpen } from "./useDeferredOpen";

const Content = lazy(() => import("./SheetContent").then((module) => ({ default: module.SheetContent })));

export function Sheet({ unmountOnClose, ...props }: ComponentProps<typeof Content> & { unmountOnClose?: boolean }) {
  const activated = useDeferredOpen(props.open);
  // A form may need to release the modal immediately even if its WebView suspends the exit animation.
  if (!props.open && (unmountOnClose || !activated)) return null;
  return (
    <Suspense fallback={<SkeletonBlock className="fixed inset-0 z-50" />}>
      <Content {...props} />
    </Suspense>
  );
}
