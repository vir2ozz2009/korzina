import { type ComponentProps, lazy, Suspense } from "react";
import { SkeletonBlock } from "./SkeletonBlock";

const Content = lazy(() => import("./ImageViewerContent").then((module) => ({ default: module.ImageViewerContent })));

export function ImageViewer(props: ComponentProps<typeof Content>) {
  return (
    <Suspense fallback={<SkeletonBlock className="fixed inset-0 z-50" />}>
      <Content {...props} />
    </Suspense>
  );
}
