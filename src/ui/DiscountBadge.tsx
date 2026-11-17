import { discountPercent } from "../shared/money";
export function DiscountBadge({ amountMinor, oldMinor }: { amountMinor: number; oldMinor?: number }) {
  if (oldMinor === undefined || oldMinor <= amountMinor) return null;
  return (
    <span className="inline-block rounded-xs bg-primary p-1 text-small font-bold text-primary-foreground">
      −{discountPercent(amountMinor, oldMinor)}%
    </span>
  );
}
