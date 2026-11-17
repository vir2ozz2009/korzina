import { Search } from "lucide-react";
import { formatMinor } from "../shared/money";
import { Button } from "./Button";
export function FloatingActions({
  totalMinor,
  count,
  currency = "VND",
  onSearch,
  onCart,
}: {
  totalMinor: number;
  count: number;
  currency?: string;
  onSearch?: () => void;
  onCart: () => void;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.27fr)] gap-3">
      {onSearch ? (
        <Button
          size="lg"
          variant="inverse"
          icon={<Search size={22} />}
          className="px-3 shadow-float"
          onClick={onSearch}
        >
          Поиск
        </Button>
      ) : (
        <span aria-hidden />
      )}
      <Button
        size="lg"
        className="w-full px-3 shadow-float"
        subtitle={count ? formatMinor(totalMinor, currency) : "Пока пусто"}
        onClick={onCart}
      >
        Корзина
      </Button>
    </div>
  );
}
