import { Skeleton } from "./Skeleton";

const sizes = { body: "h-5", caption: "h-4", title: "h-7" };
export function SkeletonText({ size = "body", short = false }: { size?: keyof typeof sizes; short?: boolean }) {
  return <Skeleton className={`${sizes[size]} ${short ? "w-2/3" : "w-full"}`} />;
}
