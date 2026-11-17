import { formatMinor } from "../shared/money";
export interface PriceProps {
  amountMinor: number;
  oldMinor?: number;
  currency?: string;
  size?: "price" | "display" | "title-3";
}
const sizes = { price: "text-price", display: "text-display", "title-3": "text-title-3" };
export function Price({ amountMinor, oldMinor, currency = "RUB", size = "price" }: PriceProps) {
  const discount = oldMinor !== undefined && oldMinor > amountMinor;
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-0">
      <span className={`${sizes[size]} ${discount ? "text-primary-text" : ""}`}>
        {formatMinor(amountMinor, currency)}
      </span>
      {discount && <del className="text-meta text-subtle-foreground">{formatMinor(oldMinor, currency)}</del>}
    </span>
  );
}
