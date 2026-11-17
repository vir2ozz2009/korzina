import type { HTMLAttributes } from "react";
export function Card({
  size = "md",
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement> & { size?: "md" | "lg" }) {
  return <div {...props} className={`space-y-3 rounded-xl bg-card ${size === "lg" ? "p-5" : "p-4"} ${className}`} />;
}
