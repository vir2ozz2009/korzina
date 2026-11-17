import { SkeletonBlock } from "./SkeletonBlock";
import { SkeletonText } from "./SkeletonText";
export function SkeletonTile() {
  return (
    <div aria-hidden className="overflow-hidden rounded-xl bg-card">
      <SkeletonBlock className="aspect-[179/142] w-full" />
      <div className="space-y-1 p-2.5">
        <div className="min-h-9 space-y-1">
          <SkeletonText size="caption" />
          <SkeletonText size="caption" short />
        </div>
        <SkeletonText size="caption" short />
        <SkeletonBlock className="h-7 w-2/3" />
        <SkeletonBlock className="h-(--control-md) w-full rounded-pill" />
      </div>
    </div>
  );
}
