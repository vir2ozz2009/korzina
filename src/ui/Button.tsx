import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { interactive } from "./interactive";

const variants = {
  primary: "bg-primary text-primary-foreground",
  secondary: "bg-secondary text-secondary-foreground",
  soft: "bg-primary-soft text-primary-text",
  ghost: "bg-transparent text-foreground",
  inverse: "bg-inverse text-inverse-foreground",
};
const sizes = {
  md: "min-h-(--control-md) text-label",
  lg: "min-h-(--control-lg) text-label",
  xl: "min-h-(--control-xl) text-title-3 font-bold",
};
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  full?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  subtitle?: string;
}
export function Button({
  variant = "primary",
  size = "md",
  full,
  loading,
  icon,
  subtitle,
  children,
  disabled,
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={props.type ?? "button"}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${interactive} whitespace-nowrap relative inline-flex shrink-0 items-center justify-center gap-2 rounded-pill px-5 ${variants[variant]} ${sizes[size]} ${full ? "w-full" : ""} ${className}`}
    >
      <span className={`flex items-center justify-center gap-2 ${loading ? "invisible" : ""}`}>
        {icon}
        <span>
          {children}
          {subtitle && <span className="block text-small font-normal">{subtitle}</span>}
        </span>
      </span>
      {loading && (
        <LoaderCircle aria-label="Загрузка" className="absolute size-5 animate-spin motion-reduce:animate-none" />
      )}
    </button>
  );
}
