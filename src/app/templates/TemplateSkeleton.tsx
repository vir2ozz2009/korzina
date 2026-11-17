import { lazy, Suspense } from "react";
import { SkeletonBlock } from "../../ui/SkeletonBlock";
import { StorefrontState } from "../../ui/StorefrontState";
import type { TemplateName } from "./types";

const Content = lazy(() => import("./ContentSkeleton").then((module) => ({ default: module.ContentSkeleton })));
export function TemplateSkeleton({ template }: { template: TemplateName }) {
  if (template === "home") return <StorefrontState state="loading" />;
  return (
    <Suspense fallback={<SkeletonBlock className="h-24" />}>
      <Content template={template} />
    </Suspense>
  );
}
