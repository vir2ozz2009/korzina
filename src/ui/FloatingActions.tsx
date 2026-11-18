import { Sparkles } from "lucide-react";
import { formatMinor } from "../shared/money";
import { Button } from "./Button";
export function FloatingActions({
  totalMinor,
  count,
  currency,
  onSearch,
  onCart,
  compact = false,
}: {
  totalMinor: number;
  count: number;
  currency?: string | null;
  onSearch?: () => void;
  compact?: boolean;
  onCart: () => void;
}) {
  return (
    <div className={compact ? "flex justify-end" : "grid grid-cols-[minmax(0,1fr)_minmax(0,1.27fr)] gap-3"}>
      {onSearch ? (
        <Button
          size="lg"
          variant="inverse"
          icon={<Sparkles size={22} />}
          className="pointer-events-auto px-3 shadow-float"
          onClick={onSearch}
        >
          Нейропоиск
        </Button>
      ) : (
        <span aria-hidden />
      )}
      <Button
        size="lg"
        className={`pointer-events-auto px-3 shadow-float ${compact ? "w-28" : "w-full"}`}
        subtitle={count && currency ? formatMinor(totalMinor, currency) : "Пока пусто"}
        onClick={onCart}
      >
        Корзина
      </Button>
    </div>
  );
}
