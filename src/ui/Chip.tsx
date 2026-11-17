import type { ButtonHTMLAttributes } from "react";
import { interactive } from "./interactive";
export function Chip({
  selected = false,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      {...props}
      type="button"
      aria-pressed={selected}
      className={`${interactive} min-h-11 shrink-0 rounded-pill px-4 text-label ${selected ? "bg-foreground text-card" : "bg-card"} ${className}`}
    />
  );
}
