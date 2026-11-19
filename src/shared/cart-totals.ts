import type { CartAdjustment, CartLine } from "./contracts/cart";
import { addMinor, multiplyMinor, subtractMinor } from "./money";

export function cartTotals(lines: CartLine[], adjustments: CartAdjustment[] = []) {
  const priced = lines.map((line) => ({
    ...line,
    totalMinor: line.available ? multiplyMinor(line.priceMinor, line.quantity) : 0,
  }));
  const subtotal = addMinor(...priced.map((line) => line.totalMinor));
  const increases = adjustments.filter(({ amount }) => amount >= 0).map(({ amount }) => amount);
  const decreases = adjustments.filter(({ amount }) => amount < 0).map(({ amount }) => -amount);
  return {
    lines: priced,
    adjustments,
    count: priced.reduce((sum, line) => sum + line.quantity, 0),
    totalMinor: subtractMinor(addMinor(subtotal, ...increases), addMinor(...decreases)),
  };
}
