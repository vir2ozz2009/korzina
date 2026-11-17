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
  onSearch: () => void;
  onCart: () => void;
}) {
  return (
    <div className="floating-actions">
      <Button size="lg" variant="inverse" icon={<Search size={22} />} className="shadow-float" onClick={onSearch}>
        Поиск
      </Button>
      <Button
        size="lg"
        className="cart-action shadow-float"
        subtitle={count ? formatMinor(totalMinor, currency) : "Пока пусто"}
        onClick={onCart}
      >
        Корзина
      </Button>
    </div>
  );
}
