import { SkeletonBlock } from "../../ui/SkeletonBlock";
import { SkeletonRow } from "../../ui/SkeletonRow";
import { SkeletonText } from "../../ui/SkeletonText";
import { SkeletonTile } from "../../ui/SkeletonTile";
import { StorefrontState } from "../../ui/StorefrontState";
import type { TemplateName } from "./types";

export function TemplateSkeleton({ template }: { template: TemplateName }) {
  if (template === "home") return <StorefrontState state="loading" />;
  return (
    <div aria-hidden="true" data-skeleton={template} className="space-y-3">
      {template === "product" ? (
        <>
          <SkeletonBlock className="aspect-square w-full rounded-xl" />
          <SkeletonText size="title" />
          <SkeletonText short />
          <SkeletonBlock className="h-24" />
        </>
      ) : template === "catalog" ? (
        <>
          <SkeletonText size="title" />
          <div className="grid grid-cols-2 gap-2">
            {[0, 1, 2, 3].map((key) => (
              <SkeletonTile key={key} />
            ))}
          </div>
        </>
      ) : template === "feedback" ? (
        <>
          <SkeletonText size="title" />
          <SkeletonBlock className="h-24" />
          <SkeletonBlock className="h-(--control-lg) rounded-pill" />
        </>
      ) : (
        <>
          {template === "order" && <SkeletonBlock className="h-28" />}
          {[0, 1, 2].map((key) => (
            <div key={key} className="rounded-xl bg-card p-4">
              {template === "form" ? (
                <>
                  <SkeletonText />
                  <SkeletonBlock className="mt-3 h-(--control-md) rounded-pill" />
                </>
              ) : (
                <SkeletonRow />
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
