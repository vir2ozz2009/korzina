import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
export interface ListItemProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  value?: ReactNode;
  href?: string;
  onClick?: () => void;
  variant?: "card" | "compact";
}
export function ListItem({ title, subtitle, icon, value, href, onClick, variant = "card" }: ListItemProps) {
  const content = (
    <>
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-label">{title}</span>
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
      <button type="button" onClick={onClick} className={className}>
        {content}
      </button>
    );
  return <div className={className}>{content}</div>;
}
