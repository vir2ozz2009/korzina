import { describe, expect, it } from "vitest";
import { addMinor, allocateMinor, multiplyMinor, percentageMinor, roundMinor, subtractMinor } from "./money";

describe("деньги: целые минимальные единицы", () => {
  it("сохраняет контрольные суммы доставки, доплаты и возврата", () => {
    expect(addMinor(18_900, 5_000)).toBe(23_900);
    expect(addMinor(23_900, 6_900)).toBe(30_800);
    expect(subtractMinor(33_900, 27_900)).toBe(6_000);
    expect(multiplyMinor(18_900, 3)).toBe(56_700);
  });
  it("округляет RUB вверх для скидки/начисления и вниз для лимита списания", () => {
    expect(percentageMinor(18_900, 1000, 100, "ceil")).toBe(1_900);
    const first = percentageMinor(18_900, 2000, 100, "ceil");
    expect(first).toBe(3_800);
    expect(percentageMinor(subtractMinor(18_900, first), 1000, 100, "ceil")).toBe(1_600);
    expect(percentageMinor(23_900, 500, 100, "ceil")).toBe(1_200);
    expect(percentageMinor(18_900, 3000, 100, "floor")).toBe(5_600);
    expect(roundMinor(150, 100, "nearest")).toBe(200);
    expect(roundMinor(149, 100, "nearest")).toBe(100);
    // Callers cap promotional rounding to the eligible remaining base.
    expect(Math.min(50, percentageMinor(50, 1000, 100, "ceil"))).toBe(50);
  });
  it("распределяет остаток детерминированно, без потери суммы", () => {
    expect(allocateMinor(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(allocateMinor(7, [0, 1, 2])).toEqual([0, 2, 5]);
    expect(allocateMinor(0, [])).toEqual([]);
    expect(allocateMinor(0, [0, 0])).toEqual([0, 0]);
    for (let total = 0; total < 300; total++) {
      const shares = allocateMinor(total, [13, 19, 0, 100]);
      expect(addMinor(...shares)).toBe(total);
      expect(shares.every(Number.isSafeInteger)).toBe(true);
      expect(shares[2]).toBe(0);
    }
  });
  it("считает точно рядом с MAX_SAFE_INTEGER", () => {
    const max = Number.MAX_SAFE_INTEGER;
    expect(allocateMinor(max, [max, max])).toEqual([4_503_599_627_370_496, 4_503_599_627_370_495]);
    expect(percentageMinor(max, 10_000)).toBe(max);
  });
  it.each([-1, 0.1, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "отклоняет неверную сумму %s",
    (value) => {
      expect(() => addMinor(value)).toThrow(RangeError);
      expect(() => allocateMinor(1, [value])).toThrow(RangeError);
    },
  );
  it("отклоняет переполнение и недопустимые операции", () => {
    expect(() => addMinor(Number.MAX_SAFE_INTEGER, 1)).toThrow();
    expect(() => subtractMinor(1, 2)).toThrow();
    expect(() => multiplyMinor(Number.MAX_SAFE_INTEGER, 2)).toThrow();
    expect(() => roundMinor(100, 0, "ceil")).toThrow();
    expect(() => percentageMinor(1, 10_001)).toThrow();
    expect(() => allocateMinor(1, [0, 0])).toThrow();
  });
});
