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
