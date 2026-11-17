import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { IconButton } from "./IconButton";
export function Header({
  title,
  onBack,
  telegram = false,
  actions,
  background = "card",
}: {
  title: string;
  onBack?: () => void;
  telegram?: boolean;
  actions?: ReactNode;
  background?: "card" | "background";
}) {
  return (
    <header className={`flex min-h-18 items-center gap-3 p-3 ${background === "card" ? "bg-card" : "bg-background"}`}>
      {onBack && !telegram && (
        <IconButton aria-label="Назад" onClick={onBack}>
          <ArrowLeft size={22} />
        </IconButton>
      )}
      <h2 className="min-w-0 flex-1 text-title-3">{title}</h2>
      {actions}
    </header>
  );
}
