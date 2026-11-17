import { Skeleton } from "./Skeleton";
export function SkeletonBlock({ className = "h-40 w-full" }: { className?: string }) {
  return <Skeleton className={className} />;
}
