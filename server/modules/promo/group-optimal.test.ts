import { expect, it, vi } from "vitest";
import { cartTotals } from "../../../src/shared/cart-totals";
import type { CartLine } from "../../../src/shared/contracts/cart";
import type { PromoTerms } from "../../../src/shared/contracts/promo";
import { type Candidate, calculatePromo } from "./calculate";
import { priceOptions } from "./group-offer";

vi.mock("./group-offer", { spy: true });
const row = (variantId: string, quantity: number, priceMinor = 100): CartLine => ({
  variantId,
  productId: variantId,
  name: variantId,
  unit: "шт",
  quantity,
  priceMinor,
  available: true,
  stock: null,
});
const offer = (id: string, group: PromoTerms["group"], extra: Partial<PromoTerms> = {}): Candidate => ({
  id,
  revision: 1,
  status: "active",
  used: 0,
  personalUsed: 0,
  terms: {
    name: id,
    kind: "automatic",
    confirmed: false,
    scope: { type: "all" },
    discount: { type: "fixed", value: 0 },
    group,
    ...extra,
  },
});
const bundle = (id: string, limit: number | null = null) =>
  offer(id, {
    type: "bundle",
    priceMinor: 150,
    limit,
    components: [...id].map((variantId) => ({ variantId, quantity: 1 })),
  });
const calc = (lines: CartLine[], offers: Candidate[]) =>
  calculatePromo(
    { revision: 1, currency: "VND", ...cartTotals(lines) },
    offers,
    { confirmed: false, completed: 0, exactUsed: false },
    ({ name }) => name,
    "CODE",
  );

// Independent oracle: label every physical unit, enumerate disjoint subsets for ONE set,
// then recursively pack these sets. Does not use production pricing/allocation/search helpers.
function exhaustive(lines: CartLine[], offers: Candidate[]) {
  const units = lines.flatMap((line) =>
    Array.from({ length: Math.min(line.quantity, line.stock ?? line.quantity) }, () => line),
  );
  const sets = offers.flatMap(({ terms }, index) => {
    const group = terms.group;
    if (!group) return [];
    return Array.from({ length: 2 ** units.length - 1 }, (_, n) => n + 1).flatMap((mask) => {
      const selected = units.filter((_, bit) => mask & (1 << bit));
      const match =
        group.type === "bundle"
          ? selected.length === group.components.reduce((sum, part) => sum + part.quantity, 0) &&
            group.components.every(
              (part) => selected.filter((unit) => unit.variantId === part.variantId).length === part.quantity,
            )
          : selected.length === group.buy + group.gift &&
            selected.every((unit) => unit.variantId === selected[0].variantId);
      const saving =
        group.type === "bundle"
          ? selected.reduce((sum, unit) => sum + unit.priceMinor, 0) - group.priceMinor
          : selected[0].priceMinor * group.gift;
      return match && saving > 0
        ? [
            {
              mask,
              saving,
              index,
              limit:
                group.type === "bundle"
                  ? (group.limit ?? (group.limit === null ? Infinity : 1))
                  : (group.limit ?? Infinity),
            },
          ]
        : [];
    });
  });
  const memo = new Map<string, number>();
  function pack(mask: number, counts: number[]): number {
    const key = `${mask}:${counts}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    const remaining = units.filter((_, bit) => !(mask & (1 << bit))).reduce((sum, unit) => sum + unit.priceMinor, 0);
    let saved = Math.max(
      0,
      ...offers.filter(({ terms }) => !terms.group).map(({ terms }) => Math.min(remaining, terms.discount.value)),
    );
    for (const set of sets) {
      if (mask & set.mask || counts[set.index] >= set.limit) continue;
      const next = [...counts];
      next[set.index]++;
      saved = Math.max(saved, set.saving + pack(mask | set.mask, next));
    }
    memo.set(key, saved);
    return saved;
  }
  return (
    units.reduce((sum, unit) => sum + unit.priceMinor, 0) -
    pack(
      0,
      offers.map(() => 0),
    )
  );
}

it("FIX-PROMO-OPT · §6.1–4 независимый перебор, лимиты, остаток, перестановки, подарок и обычный код", () => {
  const gift = offer("gift", { type: "gift", buy: 1, gift: 1, limit: 1 });
  const code = offer("code", undefined, { kind: "code", code: "CODE", discount: { type: "fixed", value: 70 } });
  for (const quantities of [
    [0, 1, 2],
    [1, 1, 1],
    [2, 2, 2],
    [3, 2, 1],
  ]) {
    for (const limit of [1, 2, null]) {
      const source = quantities.map((q, i) => row("abc"[i], q, 100 + i * 10));
      const offers = [bundle("ab", limit), bundle("ac", limit), bundle("bc", limit), gift, code];
      const expected = exhaustive(source, offers);
      for (const [lines, candidates] of [
        [source, offers],
        [source.toReversed(), offers.toReversed()],
      ] as const) {
        const result = calc(lines, candidates);
        expect(result.totalMinor).toBe(expected);
        expect(result.lines.reduce((sum, line) => sum + (line.totalMinor ?? 0), 0)).toBe(expected);
        for (const line of lines) {
          const allocated = result.adjustments
            .flatMap((adjustment) => adjustment.allocations ?? [])
            .filter((a) => a.variantId === line.variantId);
          expect(
            allocated.flatMap((a) => a.units ?? []).reduce((sum, unit) => sum + unit.quantity, 0),
          ).toBeLessThanOrEqual(line.quantity);
        }
      }
    }
  }
  expect(calc([row("a", 2), { ...row("b", 2), stock: 1 }], [bundle("ab")]).adjustments[0].groups?.count).toBe(1);
  expect(calc([row("a", 1), row("wrong", 1)], [bundle("ab")]).totalMinor).toBe(200);
});

it("FIX-PROMO-OPT · §10 равенство предпочитает автоматическое комбо, проигравший код отсутствует", () => {
  const auto = bundle("ab");
  const manual = { ...auto, id: "manual", terms: { ...auto.terms, kind: "code" as const, code: "CODE" } };
  for (const offers of [
    [auto, manual],
    [manual, auto],
  ]) {
    const result = calc([row("a", 2), row("b", 2)], offers);
    expect(result.totalMinor).toBe(300);
    expect(result.adjustments.map(({ sourceId }) => sourceId)).toEqual(["ab"]);
    expect(result.promo?.reason).toBe("better_automatic");
  }
});

it("FIX-PROMO-OPT · плотные пересечения и добор: воспроизводимый замер", () => {
  const dense = ["ab", "ac", "ad", "bc", "bd", "cd"].map((id) => bundle(id));
  for (const quantity of [2, 4, 6]) {
    vi.mocked(priceOptions).mockClear();
    const start = performance.now();
    const result = calc(
      [..."abcd"].map((id) => row(id, quantity)),
      dense,
    );
    const elapsed = performance.now() - start;
    expect(result.totalMinor).toBe(quantity * 2 * 150);
    console.info(
      JSON.stringify({
        fixture: "dense-K4",
        quantity,
        elapsedMs: elapsed,
        offerStates: vi.mocked(priceOptions).mock.calls.length,
      }),
    );
  }
  vi.mocked(priceOptions).mockClear();
  const start = performance.now();
  const gifts = Array.from({ length: 8 }, (_, i) => offer(`gift-${i}`, { type: "gift", buy: 2, gift: 1 }));
  const result = calc([row("a", 2), row("b", 2)], gifts);
  expect(result.promo?.groupHints).toHaveLength(2);
  // Identical top-ups shared by all eight offers: two searches, not sixteen.
  expect(vi.mocked(priceOptions).mock.calls.length).toBe(16);
  console.info(
    JSON.stringify({
      fixture: "eight-gift-hints",
      elapsedMs: performance.now() - start,
      offerStates: vi.mocked(priceOptions).mock.calls.length,
    }),
  );
});
