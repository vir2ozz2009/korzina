import { ChevronRight } from "lucide-react";
import type { ReactNode, Ref } from "react";
export interface ListItemProps {
  title: string;
  ref?: Ref<HTMLButtonElement>;
  disabled?: boolean;
  subtitle?: string;
  icon?: ReactNode;
  value?: ReactNode;
  href?: string;
  onClick?: () => void;
  variant?: "card" | "compact";
}
export function ListItem({
  title,
  ref,
  disabled,
  subtitle,
  icon,
  value,
  href,
  onClick,
  variant = "card",
}: ListItemProps) {
  const content = (
    <>
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-label wrap-anywhere">{title}</span>
        {subtitle && <span className="block text-small text-muted-foreground">{subtitle}</span>}
      </span>
      <span className={variant === "compact" ? "text-caption text-primary-strong" : "text-caption"}>
        {value ?? ((href || onClick) && <ChevronRight size={20} />)}
      </span>
    </>
  );
  const className = `flex min-h-(--control-lg) w-full items-center gap-3 bg-card p-3 text-left ${variant === "compact" ? "rounded-lg" : "rounded-xl"}`;
  if (href)
    return (
      <a href={href} className={className}>
        {content}
      </a>
    );
  if (onClick)
    return (
      <button ref={ref} type="button" disabled={disabled} onClick={onClick} className={className}>
        {content}
      </button>
    );
  return <div className={className}>{content}</div>;
}
