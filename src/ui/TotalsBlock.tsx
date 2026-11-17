import { formatMinor } from "../shared/money";
import { Divider } from "./Divider";
export function TotalsBlock({
  rows,
  totalMinor,
  currency = "RUB",
}: {
  rows: readonly { label: string; amountMinor: number }[];
  totalMinor: number;
  currency?: string;
}) {
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.label} className="flex justify-between gap-3 text-meta text-muted-foreground">
          <span>{row.label}</span>
          <span>{formatMinor(row.amountMinor, currency)}</span>
        </div>
      ))}
      <Divider />
      <div className="flex justify-between gap-3 text-title-3">
        <span>Итого</span>
        <span>{formatMinor(totalMinor, currency)}</span>
      </div>
    </div>
  );
}
