import { ShoppingBasket } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./Button";
export function EmptyState({
  title,
  description,
  icon,
  action,
  onAction,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-8 text-center">
      <span className="text-subtle-foreground">{icon ?? <ShoppingBasket size={48} />}</span>
      <h3 className="text-title-3">{title}</h3>
      {description && <p className="text-meta text-muted-foreground">{description}</p>}
      {action && <Button onClick={onAction}>{action}</Button>}
    </div>
  );
}
