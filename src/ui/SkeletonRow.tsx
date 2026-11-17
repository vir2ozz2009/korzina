import { SkeletonBlock } from "./SkeletonBlock";
import { SkeletonText } from "./SkeletonText";
export function SkeletonRow() {
  return (
    <div aria-hidden className="flex gap-3">
      <SkeletonBlock className="size-20 shrink-0" />
      <div className="min-w-0 flex-1 space-y-2">
        <SkeletonText />
        <SkeletonText size="caption" short />
        <SkeletonBlock className="h-9 w-2/3 rounded-pill" />
      </div>
    </div>
  );
}
