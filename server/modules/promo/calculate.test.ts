import { expect, it } from "vitest";
import { cartTotals } from "../../../src/shared/cart-totals";
import type { Cart, CartLine } from "../../../src/shared/contracts/cart";
import type { PromoTerms } from "../../../src/shared/contracts/promo";
import { type Buyer, type Candidate, calculatePromo } from "./calculate";
import { datesFor } from "./offers";

const defaults: PromoTerms = {
  name: "Скидка",
  kind: "automatic",
  discount: { type: "percent", value: 1000 },
  scope: { type: "all" },
  confirmed: false,
};
const buyer: Buyer = { confirmed: false, completed: 0, exactUsed: false };
const line = (variantId: string, priceMinor: number, props: Partial<CartLine> = {}): CartLine => ({
  variantId,
  productId: variantId,
  name: variantId,
  unit: "1 шт.",
  quantity: 1,
  priceMinor,
  stock: null,
  available: true,
  ...props,
});
const cart = (lines: CartLine[], currency = "RUB"): Cart => ({ revision: 1, currency, ...cartTotals(lines) });
const offer = (id: string, terms: Partial<PromoTerms> = {}): Candidate => ({
  id,
  revision: 1,
  terms: { ...defaults, ...terms },
  status: "active",
  used: 0,
  personalUsed: 0,
});

it("§6 §7.2 выбирает автоматику при равенстве, распределяет выигравший код один раз", () => {
  const source = cart([line("b", 30000), line("a", 20000)]);
  const manual = (value: number) =>
    offer("manual", { kind: "code", code: "COFFEE", discount: { type: "fixed", value } });
  const tie = calculatePromo(source, [offer("auto"), manual(5000)], buyer, ({ name }) => name, "COFFEE");
  expect(tie).toMatchObject({
    totalMinor: 45000,
    promo: { code: "COFFEE", reason: "better_automatic" },
    adjustments: [{ sourceId: "auto" }],
  });
  const won = calculatePromo(source, [offer("auto"), manual(7000)], buyer, ({ name }) => name, "COFFEE");
  expect(won).toMatchObject({
    totalMinor: 43000,
    adjustments: [
      {
        sourceId: "manual",
        amount: -7000,
        allocations: [
          { variantId: "a", amount: 2800 },
          { variantId: "b", amount: 4200 },
        ],
      },
    ],
  });
  const fractional = [offer("a", { discount: { type: "percent", value: 100 } })];
  expect(calculatePromo(cart([line("a", 120100)]), fractional, buyer, () => "").totalMinor).toBe(118800);
  expect(calculatePromo(cart([line("a", 1201)], "VND"), fractional, buyer, () => "").totalMinor).toBe(1188);
});

it("§13.22–23 считает добор только по подходящим товарам и не обещает проигравшую акцию", () => {
  const val = offer("baked", { minimumMinor: 50_000, scope: { type: "categories", ids: ["baked"] } });
  const baked = line("cake", 35000, { categoryId: "baked" });
  const other = line("tea", 100000, { categoryId: "drinks" });
  const topup = line("roll", 15000, { categoryId: "baked" });
  const calc = (lines: CartLine[], offers = [val], code?: string) =>
    calculatePromo(cart(lines), offers, buyer, () => "Выпечка", code);
  expect(calc([baked, other]).promo?.hint?.missingMinor).toBe(15000);
  expect(calc([baked, other, topup]).adjustments[0]?.amount).toBe(-5000);
  expect(calc([baked, other], [val, offer("all")]).promo?.hint).toBeUndefined();
  const manual = offer("code", { kind: "code", code: "SVET15", discount: { type: "percent", value: 1500 } });
  expect(calc([line("tomato", 8000, { oldPriceMinor: 10000 })], [manual], "SVET15")).toMatchObject({
    totalMinor: 8000,
    adjustments: [],
    promo: { reason: "regular_price" },
  });
});

it("§9 §10 требует подтверждённый аккаунт и ровно нужный номер покупки для разового права", () => {
  const trial = offer("second", {
    purchase: { mode: "exact", number: 2 },
    discount: { type: "percent", value: 1000, capMinor: 15000 },
  });
  const calc = (account: Buyer) => calculatePromo(cart([line("a", 200000)]), [trial], account, () => "Заказ №2");
  expect(calc(buyer).promo?.telegramHint).toBe(true);
  expect(calc({ confirmed: true, completed: 0, exactUsed: false }).adjustments).toHaveLength(0);
  expect(calc({ confirmed: true, completed: 1, exactUsed: false }).totalMinor).toBe(185000);
  expect(calc({ confirmed: true, completed: 2, exactUsed: false }).adjustments).toHaveLength(0);
  expect(calc({ confirmed: true, completed: 1, exactUsed: true }).adjustments).toHaveLength(0);
});

it("§7.1 §13.21 ограничивает период местной полуночью и включает последний день", () => {
  const result = datesFor({ fromDate: "2026-11-26", throughDate: "2026-11-28" }, "Europe/Moscow");
  expect(typeof result.start === "number" && new Date(result.start).toISOString()).toBe("2026-11-25T21:00:00.000Z");
  expect(typeof result.end === "number" && new Date(result.end).toISOString()).toBe("2026-11-28T21:00:00.000Z");
});

it("A6 §9.2 §12A/B/D · порог в обе стороны, пустой код, минимум кода и исходный ноль", () => {
  const automatic = offer("auto-delivery", { delivery: true, minimumMinor: 60000 });
  const manual = offer("delivery-code", { delivery: true, kind: "code", code: "SHIP", minimumMinor: 50000 });
  const price = (amount: number, code?: string, feeMinor: number | null = 12000, minimum = 60000) =>
    calculatePromo(
      cart([line("a", amount)]),
      [{ ...automatic, terms: { ...automatic.terms, minimumMinor: minimum } }, manual],
      buyer,
      ({ name }) => name,
      code,
      undefined,
      { applicable: true, feeMinor },
    );
  expect(price(55000)).toMatchObject({ totalMinor: 55000, delivery: { feeMinor: 12000, missingMinor: 5000 } });
  expect(price(60000)).toMatchObject({
    delivery: { feeMinor: 0, benefit: { offerId: "auto-delivery", amountMinor: 12000 } },
  });
  expect(price(60100)).toMatchObject({ delivery: { feeMinor: 0 } });
  expect(price(59900)).toMatchObject({ delivery: { feeMinor: 12000, missingMinor: 100 } });
  expect(price(55000, "")).toMatchObject({ delivery: { feeMinor: 12000 } });
  expect(price(55000, "SHIP")).toMatchObject({ delivery: { feeMinor: 0, benefit: { code: "SHIP" } } });
  expect(price(49900, "SHIP")).toMatchObject({
    promo: { reason: "minimum", missingMinor: 100 },
    delivery: { feeMinor: 12000 },
  });
  expect(price(80000, "SHIP", 12000, 150000).delivery?.missingMinor).toBeUndefined();
  expect(price(80000, undefined, 12000, 150000).delivery?.missingMinor).toBe(70000);
  for (const amount of [55000, 60000, 60100])
    for (const code of [undefined, "SHIP"]) {
      const result = price(amount, code, 0);
      expect(result.delivery).toEqual({ feeMinor: 0, baseMinor: 0 });
    }
});

it("A6 §6.1–3 §9.3 · оптимум с тарифом, позиционные скидки, поздний тариф и исключения", () => {
  const delivery = offer("ship", { delivery: true, kind: "code", code: "SHIP", minimumMinor: 50000 });
  const goods = offer("auto-goods", { discount: { type: "fixed", value: 3000 } });
  const manualGoods = offer("goods", { kind: "code", code: "GOODS", discount: { type: "fixed", value: 7000 } });
  const source = cart([line("a", 55000, { oldPriceMinor: 60000 })]);
  const price = (feeMinor: number | null, applicable = true) =>
    calculatePromo(source, [delivery, goods, manualGoods], buyer, ({ name }) => name, "SHIP", undefined, {
      feeMinor,
      applicable,
    });
  expect(price(12000)).toMatchObject({
    totalMinor: 52000,
    adjustments: [{ sourceId: "auto-goods" }],
    delivery: { feeMinor: 0 },
  });
  expect(price(null)).toMatchObject({
    delivery: { baseMinor: null, feeMinor: 0, benefit: { state: "reserved", amountMinor: 0 } },
  });
  expect(price(12000, false).delivery).toBeUndefined();
  expect(price(null, false)).toMatchObject({ promo: { reason: "delivery" } });
  expect(calculatePromo(source, [delivery], buyer, ({ name }) => name).delivery).toBeUndefined();
  const invalid = { ...delivery, status: "ended" as const };
  expect(
    calculatePromo(source, [invalid], buyer, ({ name }) => name, "SHIP", undefined, {
      applicable: true,
      feeMinor: 12000,
    }),
  ).toMatchObject({ delivery: { feeMinor: 12000 }, promo: { reason: "expired" } });
});

it("A6 §7.5 · итог 500 с подарком и доставкой выгоднее комбо 470 плюс тариф 120", () => {
  const source = cart([line("a", 17500, { quantity: 3 }), line("b", 15000)]);
  const gift = offer("gift", { group: { type: "gift", buy: 2, gift: 1 }, scope: { type: "variants", ids: ["a"] } });
  const bundle = offer("bundle", {
    kind: "code",
    code: "SET",
    group: { type: "bundle", components: [{ variantId: "a", quantity: 3 }], priceMinor: 32000, limit: 1 },
  });
  const shipping = offer("auto-delivery", { delivery: true, minimumMinor: 50000 });
  const result = calculatePromo(source, [gift, bundle, shipping], buyer, ({ name }) => name, "SET", undefined, {
    applicable: true,
    feeMinor: 12000,
  });
  expect(result).toMatchObject({
    totalMinor: 50000,
    adjustments: [{ sourceId: "gift" }],
    delivery: { feeMinor: 0, benefit: { offerId: "auto-delivery" } },
    promo: { code: "SET", reason: "better_automatic" },
  });
});
