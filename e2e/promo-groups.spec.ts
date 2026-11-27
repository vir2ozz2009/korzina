import { expect, type Page, test } from "@playwright/test";
import { type Candidate, calculatePromo, promoLabel } from "../server/modules/promo/calculate";
import { cartTotals } from "../src/shared/cart-totals";
import type { CartLine } from "../src/shared/contracts/cart";
import type { Receiving } from "../src/shared/contracts/receiving";
import { checkOptimalBundles } from "./promo-optimal";

const item: CartLine = {
  variantId: "berry-125",
  productId: "berry",
  name: "Голубика",
  unit: "125 г",
  quantity: 3,
  priceMinor: 60_000,
  stock: 12,
  available: true,
};
const automatic: Candidate = {
  id: "blueberry-gift",
  revision: 1,
  status: "active",
  used: 0,
  personalUsed: 0,
  terms: {
    name: "2+1",
    kind: "automatic",
    confirmed: false,
    group: { type: "gift", buy: 2, gift: 1, limit: 2 },
    scope: { type: "variants", ids: [item.variantId] },
    discount: { type: "fixed", value: 0 },
  },
};
const manual: Candidate = {
  id: "other",
  revision: 1,
  status: "active",
  used: 0,
  personalUsed: 0,
  terms: {
    name: "Скидка",
    kind: "code",
    code: "BERRY10",
    confirmed: false,
    scope: { type: "all" },
    discount: { type: "percent", value: 1000 },
  },
};
const fulfillment = {
  pickup: { address: "28 Lê Lợi, Хошимин", hours: "09:00–20:00" },
  delivery: { mode: "text", payee: "shop", feeMinor: 20_000 },
  acceptingOrders: true,
  unavailable: {},
  savedAddresses: [],
  addressesRevision: 0,
  requiredDetails: [],
};

async function buyerFixture(page: Page, group: boolean, initialQuantity = item.quantity, discount = false) {
  let quantity = initialQuantity;
  let revision = 1;
  let receiving: Receiving = { mode: "pickup" };
  let code: string | undefined;
  const buyer = { confirmed: true, completed: 0, exactUsed: false };
  const offers = group ? [automatic, manual] : [manual];
  if (discount)
    offers.push({
      ...manual,
      id: "store-discount",
      terms: { ...manual.terms, kind: "automatic", code: undefined },
    });
  const cart = () =>
    calculatePromo(
      { revision, currency: "VND", ...cartTotals([{ ...item, quantity }]) },
      offers,
      buyer,
      (terms) => promoLabel(terms, String),
      code,
    );
  const availability = () =>
    receiving.mode === "pickup"
      ? { mode: "pickup", available: true, feeMinor: 0 }
      : { mode: "delivery", available: true, inZone: null, payee: "shop", tariff: "fixed", feeMinor: 20_000 };
  await page.route(/\/api\/(cart|checkout\/summary|receiving|auth\/(contact|guest))(\/|\?|$)/, (route) => {
    const req = route.request();
    switch (new URL(req.url()).pathname) {
      case "/api/cart/promotions":
        return route.fulfill({ json: [] });
      case "/api/auth/guest":
        return route.fulfill({ json: {} });
      case "/api/auth/contact":
        return route.fulfill({ json: { phone: null, telegramLinked: true } });
      case "/api/cart": {
        if (req.method() === "POST") {
          const input = req.postDataJSON() as {
            quantity?: number;
            promoAction?: string;
            code?: string;
            addItems?: { variantId: string; quantity: number }[];
          };
          if (input.addItems) expect(input.addItems.map(({ variantId }) => variantId)).toEqual([item.variantId]);
          quantity = input.quantity ?? quantity + (input.addItems?.[0]?.quantity ?? 0);
          if (input.promoAction) code = input.code;
          revision++;
        }
        return route.fulfill({ json: cart() });
      }
      case "/api/receiving":
        if (req.method() === "POST") {
          receiving = req.postDataJSON().receiving as Receiving;
          revision++;
        }
        return route.fulfill({ json: { ...fulfillment, receiving, revision, availability: availability() } });
      case "/api/checkout/summary": {
        const priced = cart();
        const deliveryMinor = availability().feeMinor;
        return route.fulfill({
          json: {
            ...priced,
            availability: availability(),
            totalMinor: priced.totalMinor + deliveryMinor,
            deliveryMinor,
            acceptingOrders: true,
            shortMinor: 0,
            minimumMinor: 0,
          },
        });
      }
      default:
        return route.fallback();
    }
  });
}

for (const width of [360, 390]) {
  for (const discount of [false, true]) {
    test(`#315 · 1 → 2 → 3 → 2 · ${width}px · скидка ${discount ? "10%" : "нет"}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await buyerFixture(page, true, 1, discount);
      await page.goto("/cart?shop=test2");
      const row = page.getByRole("listitem").filter({ hasText: "Голубика" });
      const add = (count: number) => row.getByRole("button", { name: `Добавить ${count}`, exact: true });
      const gift = row.getByRole("button", { name: "1 в подарок", exact: true });
      const regular = discount ? 54_000 : 60_000;
      async function expectTopUp(count: number, numberOfUnits: number, shot: string) {
        await expect(gift).toHaveCount(0);
        await expect(add(count)).toBeEnabled();
        await expect(total(page)).toContainText(money(regular * numberOfUnits));
        await screenshot(page, shot);
      }
      await expectTopUp(2, 1, "01-one");
      await row.getByRole("button", { name: "Увеличить количество" }).click();
      await expectTopUp(1, 2, "02-two");
      await add(1).click();
      await expect(gift).toHaveCount(1);
      await expect(gift).toBeVisible();
      await expect(add(1)).toHaveCount(0);
      await expect(total(page)).toContainText(money(120_000));
      await screenshot(page, "03-three");
      await row.getByRole("button", { name: "Уменьшить количество" }).click();
      await expectTopUp(1, 2, "04-back-to-two");
      await page.reload();
      await expect(add(1)).toBeEnabled();
      await row.getByRole("button", { name: "Уменьшить количество" }).click();
      await add(2).click();
      await expect(gift).toBeVisible();
      await expect(total(page)).toContainText(money(120_000));
    });
  }
}

async function screenshot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: test.info().outputPath(`${name}.png`), animations: "disabled", fullPage: true });
}
const total = (page: Page) => page.getByText("Итого", { exact: true }).locator("..");
const money = (value: number) => new RegExp(value.toLocaleString("ru-RU").replace(/\s/gu, "\\s"));

for (const width of [360, 390]) {
  for (const group of [false, true]) {
    test(`12.2 · корзина ${group ? "с подарком" : "контроль main"} · ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await buyerFixture(page, group);
      await page.goto("/cart?shop=test2");
      await expect(total(page)).toContainText(money(group ? 120_000 : 180_000));
      await expect(page.getByRole("radio", { name: "Самовывоз" })).toBeChecked();
      await screenshot(page, `cart-${width}`);
      if (group) {
        const row = page.getByRole("listitem").filter({ hasText: "Голубика" });
        const gift = (text: string) => row.getByRole("button", { name: text, exact: true });
        await expect(gift("1 в подарок")).toHaveCount(1);
        await gift("1 в подарок").click();
        const details = page.getByRole("dialog", { name: "Почему такая сумма" });
        await expect(details).toContainText(/2 × 60\s000/);
        await expect(details).toContainText(/1 в подарок × 0/);
        await screenshot(page, `details-${width}`);
        await page.keyboard.press("Escape");
        await expect(details).toBeHidden();
        await row.getByRole("button", { name: "Уменьшить количество" }).click();
        await page.getByRole("button", { name: "Добавить 1", exact: true }).click();
        await expect(gift("1 в подарок")).toBeVisible();
        for (let index = 0; index < 3; index++) await row.getByRole("button", { name: "Увеличить количество" }).click();
        await expect(gift("2 в подарок")).toBeVisible();
        await expect(total(page)).toContainText(money(240_000));
        await screenshot(page, `six-${width}`);
        for (let index = 0; index < 3; index++) await row.getByRole("button", { name: "Уменьшить количество" }).click();
      }
      await page.getByRole("radio", { name: "Доставка" }).click();
      await page.getByRole("button", { name: "Ввести адрес вручную", exact: true }).click();
      const address = page.getByRole("dialog", { name: "Ввести адрес вручную" });
      await address.getByRole("textbox", { name: "Адрес доставки" }).fill("28 Lê Lợi, Хошимин");
      await address.getByRole("button", { name: "Сохранить адрес", exact: true }).click();
      await expect(page.getByRole("button", { name: /28 Lê Lợi/ })).toBeVisible();
      await expect(total(page)).toContainText(money(group ? 140_000 : 200_000));
      await screenshot(page, `delivery-${width}`);
      await page.getByRole("button", { name: "Промокод", exact: true }).click();
      const sheet = page.getByRole("dialog", { name: "Промокод" });
      await sheet.getByRole("textbox", { name: "Промокод" }).fill("BERRY10");
      await sheet.getByRole("button", { name: "Применить", exact: true }).click();
      if (group) {
        await expect(page.getByText("Скидка магазина выгоднее", { exact: true })).toBeVisible();
        await expect(total(page)).toContainText(money(140_000));
      } else await expect(total(page)).toContainText(money(182_000));
      await page.getByRole("button", { name: /^BERRY10/ }).click();
      await sheet.getByRole("button", { name: "Убрать" }).click();
      await page.getByRole("radio", { name: "Самовывоз" }).click();
      await expect(page.getByRole("radio", { name: "Самовывоз" })).toBeChecked();
      await expect(total(page)).toContainText(money(group ? 120_000 : 180_000));
      await page.getByRole("button", { name: /^Продолжить/ }).click();
      await expect(page).toHaveURL(/\/checkout\/receiving/);
    });
  }
}

test("FIX-PROMO-OPT · пересекающиеся комбо, пересчёт и оформление · 390px", async ({ page }) => {
  await checkOptimalBundles(page);
});
