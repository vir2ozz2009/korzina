import { type ComponentProps, lazy, Suspense } from "react";
import { SkeletonBlock } from "./SkeletonBlock";

const Content = lazy(() => import("./PhotoPickerContent").then((module) => ({ default: module.PhotoPickerContent })));

export function PhotoPicker(props: ComponentProps<typeof Content>) {
  return (
    <Suspense fallback={<SkeletonBlock className="h-24 w-full" />}>
      <Content {...props} />
    </Suspense>
  );
}
