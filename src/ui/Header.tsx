import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { IconButton } from "./IconButton";
export function Header({
  title,
  onBack,
  telegram = false,
  actions,
  headingLevel = 2,
  background = "card",
}: {
  title: string;
  onBack?: () => void;
  telegram?: boolean;
  actions?: ReactNode;
  headingLevel?: 1 | 2;
  background?: "card" | "background";
}) {
  const Title = headingLevel === 1 ? "h1" : "h2";
  return (
    <header className={`flex min-h-18 items-center gap-3 p-3 ${background === "card" ? "bg-card" : "bg-background"}`}>
      {onBack && !telegram && (
        <IconButton aria-label="Назад" onClick={onBack}>
          <ArrowLeft size={22} />
        </IconButton>
      )}
      <Title className={`min-w-0 flex-1 truncate ${headingLevel === 1 ? "text-title-1" : "text-title-3"}`}>
        {title}
      </Title>
      {actions}
    </header>
  );
}
