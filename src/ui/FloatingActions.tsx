import { Search, ShoppingBasket } from "lucide-react";
import { formatMinor } from "../shared/money";
import { Button } from "./Button";
export function FloatingActions({
  totalMinor,
  count,
  currency = "RUB",
  onSearch,
  onCart,
  inputActive = false,
}: {
  totalMinor: number;
  count: number;
  currency?: string;
  onSearch: () => void;
  onCart: () => void;
  inputActive?: boolean;
}) {
  if (inputActive) return null;
  return (
    <div className="flex justify-between gap-3">
      <Button size="lg" variant="inverse" className="shadow-float" icon={<Search size={22} />} onClick={onSearch}>
        Поиск
      </Button>
      {count > 0 && (
        <Button
          size="lg"
          className="shadow-float"
          icon={<ShoppingBasket size={22} />}
          subtitle={formatMinor(totalMinor, currency)}
          onClick={onCart}
        >
          Корзина · {count}
        </Button>
      )}
    </div>
  );
}
