import { lazy, Suspense } from "react";
import { SkeletonBlock } from "../../ui/SkeletonBlock";
import { StorefrontState } from "../../ui/StorefrontState";
import type { TemplateName } from "./types";

const Fallback = () => <SkeletonBlock className="h-24" />;
const Content = lazy(() =>
  import("./ContentSkeleton")
    .then((module) => ({ default: module.ContentSkeleton }))
    .catch(() => ({ default: Fallback })),
);
export function TemplateSkeleton({ template }: { template: TemplateName }) {
  if (template === "home") return <StorefrontState state="loading" />;
  return (
    <Suspense fallback={<Fallback />}>
      <Content template={template} />
    </Suspense>
  );
}
