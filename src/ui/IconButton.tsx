import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { interactive } from "./interactive";
export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  "aria-label": string;
  background?: "card" | "transparent";
  badge?: number;
  loading?: boolean;
}
export function IconButton({
  background = "transparent",
  badge,
  loading,
  disabled,
  children,
  className = "",
  ...props
}: IconButtonProps) {
  return (
    <button
      {...props}
      type={props.type ?? "button"}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${interactive} relative inline-flex size-(--control-md) shrink-0 items-center justify-center rounded-pill ${background === "card" ? "bg-card" : ""} ${className}`}
    >
      {loading ? <LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" /> : children}
      {!!badge && (
        <span className="absolute -top-1 -right-1 rounded-pill bg-primary px-1.5 text-micro text-primary-foreground">
          {badge}
        </span>
      )}
    </button>
  );
}
