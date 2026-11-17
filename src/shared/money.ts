// All amounts are non-negative safe integers in the currency's minor unit.
export type Rounding = "floor" | "ceil" | "nearest";
function integer(value: number): bigint {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError("Expected a non-negative safe integer");
  return BigInt(value);
}
function safe(value: bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) throw new RangeError("Money overflow or negative amount");
  return result;
}
function divide(value: bigint, divisor: bigint, mode: Rounding): bigint {
  if (divisor <= 0n) throw new RangeError("Divisor must be positive");
  const remainder = value % divisor;
  const increment = mode === "ceil" ? remainder > 0n : mode === "nearest" && remainder * 2n >= divisor;
  return value / divisor + (increment ? 1n : 0n);
}
export function addMinor(...amounts: number[]): number {
  return safe(amounts.reduce((sum, amount) => sum + integer(amount), 0n));
}
export function subtractMinor(amount: number, deduction: number): number {
  return safe(integer(amount) - integer(deduction));
}
export function multiplyMinor(amount: number, quantity: number): number {
  return safe(integer(amount) * integer(quantity));
}
export function roundMinor(amount: number, unit: number, mode: Rounding): number {
  const step = integer(unit);
  return safe(divide(integer(amount), step, mode) * step);
}
export function percentageMinor(amount: number, basisPoints: number, unit = 1, mode: Rounding = "floor"): number {
  if (basisPoints > 10_000) throw new RangeError("Percentage exceeds 100%");
  const step = integer(unit);
  return safe(divide(integer(amount) * integer(basisPoints), 10_000n * step, mode) * step);
}

// Largest remainder method: ties go to earlier lines; the allocations always sum to total.
export function allocateMinor(total: number, weights: readonly number[]): number[] {
  const amount = integer(total);
  const parts = weights.map(integer);
  const sum = parts.reduce((a, b) => a + b, 0n);
  if (sum === 0n) {
    if (amount !== 0n) throw new RangeError("Cannot allocate over zero weights");
    return weights.map(() => 0);
  }
  const shares = parts.map((weight) => (amount * weight) / sum);
  const remaining = amount - shares.reduce((a, b) => a + b, 0n);
  const order = parts
    .map((weight, index) => ({ index, remainder: (amount * weight) % sum }))
    .sort((a, b) => (a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1));
  for (let i = 0; i < Number(remaining); i++) shares[order[i].index] += 1n;
  return shares.map(safe);
}

export function formatMinor(amount: number, currency = "RUB"): string {
  const minor = integer(amount);
  const formatter = new Intl.NumberFormat("ru-RU", { style: "currency", currency });
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  const scale = 10n ** BigInt(digits);
  const fraction = minor % scale;
  // Format the whole part as BigInt so even MAX_SAFE_INTEGER keeps its last kopeck.
  const whole = new Intl.NumberFormat("ru-RU", { style: "currency", currency, maximumFractionDigits: 0 });
  const suffix = fraction ? `,${fraction.toString().padStart(digits, "0")}` : "";
  const parts = whole.formatToParts(minor / scale);
  const lastInteger = parts.findLastIndex((part) => part.type === "integer");
  return parts.map((part, index) => part.value + (index === lastInteger ? suffix : "")).join("");
}

export function discountPercent(amount: number, oldAmount: number): number {
  const current = integer(amount);
  const old = integer(oldAmount);
  return old > current ? Number(((old - current) * 100n) / old) : 0;
}
