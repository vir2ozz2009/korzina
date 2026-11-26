import { expect, it } from "vitest";
import { cartTotals } from "../../../src/shared/cart-totals";
import type { Cart, CartLine } from "../../../src/shared/contracts/cart";
import type { PromoTerms } from "../../../src/shared/contracts/promo";
import { type Candidate, calculatePromo, promoLabel } from "./calculate";

const line = (variantId: string, priceMinor: number, quantity: number, extra: Partial<CartLine> = {}): CartLine => ({
  variantId,
  productId: variantId,
  name: variantId,
  unit: "125 г",
  quantity,
  priceMinor,
  stock: null,
  available: true,
  ...extra,
});
const offer = (id: string, group: PromoTerms["group"], terms?: Partial<PromoTerms>): Candidate => ({
  id,
  revision: 1,
  status: "active",
  used: 0,
  personalUsed: 0,
  terms: {
    name: id,
    group,
    kind: "automatic",
    discount: { type: "fixed", value: 0 },
    scope: { type: "all" },
    confirmed: false,
    ...terms,
  },
});
const cart = (lines: CartLine[]): Cart => ({ revision: 1, currency: "VND", ...cartTotals(lines) });
const calc = (lines: CartLine[], offers: Candidate[], code?: string) =>
  calculatePromo(
    cart(lines),
    offers,
    { confirmed: false, completed: 0, exactUsed: false },
    (terms) => promoLabel(terms, String),
    code,
  );
const gift = (limit?: number) => offer("gift", { type: "gift", buy: 2, gift: 1, limit });
const combo = (limit?: number | null, manual = false) =>
  offer(
    "combo",
    {
      type: "bundle",
      priceMinor: 220,
      components: [
        { variantId: "a", quantity: 1 },
        { variantId: "b", quantity: 1 },
      ],
      limit,
    },
    manual ? { kind: "code", code: "COMBO" } : undefined,
  );

it("§7.1–2, §11 сгруппированы только одинаковые фасовки, лимит соблюдается независимо от порядка строк", () => {
  expect(calc([line("a", 60000, 2), line("b", 90000, 1)], [gift()])).toMatchObject({
    totalMinor: 210000,
    adjustments: [],
    promo: {
      groupHints: expect.arrayContaining([
        expect.objectContaining({ missing: [{ variantId: "a", quantity: 1, name: "a", unit: "125 г" }] }),
      ]),
    },
  });
  const source = [line("a", 200, 3), line("b", 100, 3)];
  expect(calc(source, [gift()]).totalMinor).toBe(600);
  expect(calc(source.toReversed(), [gift(1)])).toMatchObject({
    totalMinor: 700,
    adjustments: [{ allocations: [{ variantId: "a", amount: 200, gifts: 1 }] }],
  });
  const six = calc([line("a", 60_000, 6)], [gift(2)]);
  expect(six).toMatchObject({
    totalMinor: 240_000,
    adjustments: [
      {
        allocations: [
          {
            gifts: 2,
            units: [
              { quantity: 2, paidMinor: 0 },
              { quantity: 4, paidMinor: 60_000 },
            ],
          },
        ],
      },
    ],
  });
  expect(calc([line("a", 60_000, 7)], [gift(2)]).promo?.groupHints).toBeUndefined();
  expect(calc([line("a", 60_000, 3, { stock: 2 })], [gift()]).adjustments).toEqual([]);
  expect(calc([line("a", 200, 3)], [offer("1+2", { type: "gift", buy: 1, gift: 2 })]).totalMinor).toBe(200);
});

it("§7.3–4 и §7.10 использует фасовки и лимит, код не получает скидку при проигрыше", () => {
  const source = [line("a", 150, 3), line("b", 100, 3)];
  for (const [limit, count, totalMinor] of [
    [1, 1, 720],
    [2, 2, 690],
    [null, 3, 660],
  ] as const) {
    for (const manual of [false, true]) {
      expect(calc(source, [combo(limit, manual)], manual ? "COMBO" : undefined)).toMatchObject({
        totalMinor,
        adjustments: [{ groups: { count, possible: 3 } }],
      });
    }
  }
  expect(calc([line("a", 150, 3), line("b", 100, 2)], [combo(null)]).totalMinor).toBe(590);
  expect(calc([line("a", 150, 1), line("wrong", 100, 1)], [combo()]).adjustments).toEqual([]);
  expect(calc([line("a", 150, 1), line("b", 100, 1)], [combo()]).totalMinor).toBe(220);
  expect(calc(source, [combo(undefined, true), gift()], "COMBO")).toMatchObject({
    totalMinor: 500,
    promo: { reason: "better_automatic" },
    adjustments: [{ sourceId: "gift" }],
  });
  expect(calc([line("a", 120, 1), line("b", 90, 1)], [combo()]).totalMinor).toBe(210);
});

it("#315 · предлагает только выигравшую, доступную следующую группу той же фасовки", () => {
  const discount = (value: number) => offer("discount", undefined, { discount: { type: "percent", value } });
  const source = [line("a", 150, 2), line("b", 100, 1, { stock: 2 })];
  const hint = [{ giftQuantity: 1, missing: [{ variantId: "a", quantity: 1 }] }];
  expect(calc(source, [gift(), combo()]).promo?.groupHints).toMatchObject(hint);
  expect(calc(source, [gift(), discount(5000)]).promo?.groupHints).toBeUndefined();
  expect(
    calc(source, [
      gift(),
      {
        ...combo(),
        terms: {
          ...combo().terms,
          group: {
            type: "bundle",
            priceMinor: 1,
            components: [
              { variantId: "a", quantity: 2 },
              { variantId: "b", quantity: 1 },
            ],
          },
        },
      },
    ]).promo?.groupHints,
  ).toBeUndefined();
  expect(calc(source, [{ ...gift(), terms: { ...gift().terms, confirmed: true } }]).promo?.groupHints).toBeUndefined();
  expect(calc(source, [{ ...gift(), terms: { ...gift().terms, minimumQuantity: 4 } }]).promo?.groupHints).toMatchObject(
    hint,
  );
  expect(
    calc(source, [{ ...gift(), terms: { ...gift().terms, minimumQuantity: 5 } }]).promo?.groupHints,
  ).toBeUndefined();
  expect(calc([line("a", 150, 2)], [offer("1+2", { type: "gift", buy: 1, gift: 2 })]).promo?.groupHints).toMatchObject([
    { giftQuantity: 2, missing: [{ variantId: "a", quantity: 1 }] },
  ]);
});

it("§7.5 сохраняет участникам пропорциональные оплаченные доли и складывает совместимые акции на остатке", () => {
  const bundle = offer("combo", {
    type: "bundle",
    priceMinor: 240,
    components: [
      { variantId: "a", quantity: 1 },
      { variantId: "b", quantity: 1 },
    ],
  });
  const extra = offer("other", undefined, {
    discount: { type: "fixed", value: 25 },
    scope: { type: "variants", ids: ["c"] },
  });
  const result = calc([line("b", 100, 1), line("a", 200, 1), line("c", 100, 1)], [extra, bundle]);
  expect(result.totalMinor).toBe(315);
  expect(result.adjustments).toMatchObject([
    {
      sourceId: "combo",
      allocations: [
        { variantId: "a", units: [{ quantity: 1, paidMinor: 160 }] },
        { variantId: "b", units: [{ quantity: 1, paidMinor: 80 }] },
      ],
    },
    { sourceId: "other", amount: -25 },
  ]);
  expect(result.lines.map(({ totalMinor }) => totalMinor)).toEqual([80, 160, 75]);
});
