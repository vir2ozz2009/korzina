import { expect, type Page } from "@playwright/test";
import { type Candidate, calculatePromo } from "../server/modules/promo/calculate";
import { cartTotals } from "../src/shared/cart-totals";
import type { CartLine } from "../src/shared/contracts/cart";
import type { PromoOffer, PromoTerms } from "../src/shared/contracts/promo";
import { checkDeliveryLayout } from "./delivery-layout";

const items: CartLine[] = [
  {
    variantId: "tomato",
    productId: "tomato",
    name: "Томаты",
    unit: "500 г",
    quantity: 1,
    priceMinor: 55000,
    available: true,
    stock: 99,
    image: { src: "/seed/tomato-photo-1200.webp", srcSet: "", original: { src: "/seed/tomato-photo-1200.webp" } },
  },
  {
    variantId: "cucumber",
    productId: "cucumber",
    name: "Огурцы",
    unit: "100 г",
    quantity: 1,
    priceMinor: 5000,
    available: true,
    stock: 99,
    image: { src: "/seed/cucumber-1200.webp", srcSet: "", original: { src: "/seed/cucumber-1200.webp" } },
  },
];
const fulfillment = {
  delivery: { mode: "text", payee: "shop" },
  pickup: null,
  acceptingOrders: true,
  unavailable: {},
  requiredDetails: [],
};
const availability = { mode: "delivery", available: true, payee: "shop", tariff: "fixed", feeMinor: 12000 };
const receiving = { mode: "delivery", address: "Адрес в зоне доставки · пример" };
const buyer = { confirmed: true, completed: 0, exactUsed: false };

export async function checkDelivery(page: Page, store = "test2") {
  await page.unrouteAll({ behavior: "wait" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.route(/\/api\/auth\/(guest|telegram)(?:\?|$)/, (route) => route.fulfill({ json: { kind: "telegram" } }));
  await page.route(/\/api\/favorites(?:\?|$)/, (route) => route.fulfill({ json: { ids: [], revision: 0 } }));
  await page.route(/\/api\/auth\/session(?:\?|$)/, (route) => route.fulfill({ json: { subject: null } }));
  const shop = {
    id: "fixture",
    slug: store,
    name: "Второй магазин",
    promotions: true,
    timeZone: "Europe/Moscow",
    permissions: ["catalog"],
  };
  const offers: PromoOffer[] = [];
  let lines = items.map((line) => ({ ...line }));
  let revision = 1;
  let code: string | undefined;
  const candidate = (terms: PromoTerms, id = "example"): Candidate => ({
    id,
    terms,
    revision: 1,
    status: "active",
    used: 0,
    personalUsed: 0,
  });
  const price = (terms: PromoTerms[], values = lines, entered = code) =>
    calculatePromo(
      { revision, currency: "RUB", ...cartTotals(values) },
      terms.map((term, i) => candidate(term, offers[i]?.id)),
      buyer,
      ({ name }) => name,
      entered,
      undefined,
      { applicable: true, feeMinor: 12000 },
    );
  await page.route(/\/api\/seller\/cabinet(?:\?|$)/, (route) =>
    route.fulfill({ json: { telegramId: "fixture", current: shop, shops: [shop] } }),
  );
  await page.route(/\/api\/seller\/promotions(?:\/[^?]+)?(?:\?|$)/, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/catalog"))
      return route.fulfill({
        json: {
          variants: items.map((line) => ({
            id: line.variantId,
            productId: line.productId,
            productName: line.name,
            name: line.unit,
          })),
          categories: [],
        },
      });
    if (path.endsWith("/delivery-policy"))
      return route.fulfill({ json: { offer: offers.find((offer) => offer.id === "auto-delivery") ?? null } });
    if (path.endsWith("/example")) {
      const input = route.request().postDataJSON();
      const values = input.automatic
        ? items
        : input.lines.map((part: { variantId: string; quantity: number }) => ({
            ...items.find((line) => line.variantId === part.variantId),
            quantity: part.quantity,
          }));
      const cart = price([input.terms], values, input.enteredCode ?? undefined);
      return route.fulfill({
        json: {
          ...cart,
          fulfillment,
          receiving,
          availability,
          confirmed: true,
          completed: 0,
          exampleProblem: null,
          publicOffers: [],
          timeZone: shop.timeZone,
          method: "delivery",
          deliveryMinor: cart.delivery?.feeMinor ?? 12000,
          payableMinor: cart.totalMinor + (cart.delivery?.feeMinor ?? 12000),
        },
      });
    }
    if (route.request().method() === "POST") {
      const input = route.request().postDataJSON();
      const id = input.terms.kind === "automatic" ? "auto-delivery" : "delivery-code";
      const offer: PromoOffer = {
        id,
        terms: input.terms,
        revision: 1,
        status: input.action === "draft" ? "draft" : "active",
        used: 0,
        orders: 0,
        savingsMinor: 0,
      };
      const index = offers.findIndex((entry) => entry.id === offer.id);
      if (index === -1) offers.push(offer);
      else offers[index] = offer;
      return route.fulfill({ json: offer });
    }
    if (path.endsWith("/report"))
      return route.fulfill({
        json: {
          orderCount: 0,
          customers: 0,
          guestOrders: 0,
          deliveryMinor: 0,
          thresholdCount: 0,
          thresholdAverage: null,
          purchaseStats: [],
          itemsMinor: 0,
          savingsMinor: 0,
          orders: [],
          nextOffset: null,
        },
      });
    const id = path.split("/").at(-1);
    return route.fulfill({
      json:
        id === "promotions"
          ? { offers, prices: [], currency: "RUB", timeZone: shop.timeZone, nextOffset: null }
          : { ...offers.find((offer) => offer.id === id), currency: "RUB" },
    });
  });
  const form = page.getByRole("dialog", { name: "Условия акции" });
  const preview = async () => {
    await form.getByRole("button", { name: "Посмотреть, как видит покупатель" }).click();
    await expect(page.getByRole("heading", { name: "Корзина", exact: true })).toBeVisible();
    await expect(page.locator("details")).not.toHaveAttribute("open", "");
    await expect(page.getByText("Томаты", { exact: true })).toBeVisible();
  };
  await page.goto(`/seller/promotions?store=${store}`);
  await page.getByRole("button", { name: "Создать акцию" }).click();
  await page.getByRole("button", { name: /Все виды акций/ }).click();
  await page.getByRole("button", { name: /Бесплатная доставка от суммы/ }).click();
  await form.getByLabel("Минимальная сумма товаров").fill("600");
  await page.screenshot({ path: "test-results/a6/automatic-form-390.png" });
  await preview();
  await expect(page.getByText("Доставка бесплатно от суммы заказа", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Закрыть корзину" }).click();
  await page.getByRole("button", { name: "Опубликовать", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Акция", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await page.getByRole("button", { name: "Создать акцию" }).click();
  await page.getByRole("button", { name: /Все виды акций/ }).click();
  await page.getByRole("button", { name: /^Промокод / }).click();
  await form.getByLabel("Название", { exact: true }).fill("Доставка по коду");
  await form.getByLabel("Код", { exact: true }).fill("SHIP");
  await form.getByLabel("Выгода", { exact: true }).selectOption("delivery");
  await form.getByLabel("Минимальная сумма товаров").fill("500");
  await form.getByLabel("Сколько раз одному покупателю").fill("");
  await preview();
  await expect(page.getByRole("button", { name: "SHIP", exact: true })).toBeVisible();
  await expect(page.getByText("Доставка бесплатно по промокоду", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/a6/code-example-390.png" });
  await page.getByRole("button", { name: "Закрыть корзину" }).click();
  await page.getByRole("button", { name: "Опубликовать", exact: true }).click();
  expect(offers.map((offer) => offer.terms.delivery)).toEqual([true, true]);
  await page.route(/\/api\/(cart|checkout\/summary|receiving|auth\/contact)(\/|\?|$)/, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/cart/promotions") return route.fulfill({ json: [] });
    if (path === "/api/auth/contact") return route.fulfill({ json: { telegramLinked: true } });
    if (path === "/api/receiving")
      return route.fulfill({ json: { ...fulfillment, revision, receiving, availability } });
    if (path === "/api/receiving/availability") return route.fulfill({ json: { mode: "after_order", days: [] } });
    if (route.request().method() === "POST") {
      const input = route.request().postDataJSON();
      if (input.promoAction === "apply") code = input.code;
      else if (input.promoAction === "remove") code = undefined;
      else if (input.variantId)
        lines = lines
          .filter((line) => line.variantId !== input.variantId || input.quantity)
          .map((line) => (line.variantId === input.variantId ? { ...line, quantity: input.quantity } : line));
      revision++;
    }
    const cart = price(offers.map((offer) => offer.terms));
    return route.fulfill({
      json:
        path === "/api/checkout/summary"
          ? {
              currency: "RUB",
              availability,
              acceptingOrders: true,
              shortMinor: 0,
              totalMinor: cart.totalMinor + (cart.delivery?.feeMinor ?? 12000),
              deliveryMinor: cart.delivery?.feeMinor ?? 12000,
            }
          : cart,
    });
  });
  await page.goto(`/cart?shop=${store}`);
  await expect(page.getByText("Доставка бесплатно от суммы заказа", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Удалить Огурцы", exact: true }).click();
  await expect(page.getByText(/До бесплатной доставки ещё/)).toContainText(/50/);
  await expect(page.getByText("Итого", { exact: true }).locator("..")).toContainText(/670/);
  await page.getByRole("button", { name: "Промокод", exact: true }).click();
  const codeDialog = page.getByRole("dialog");
  await codeDialog.getByLabel("Промокод", { exact: true }).fill("SHIP");
  await codeDialog.getByRole("button", { name: "Применить", exact: true }).click();
  await expect(page.getByText("Доставка бесплатно по промокоду", { exact: true })).toBeVisible();
  await expect(page.getByText(/До бесплатной доставки ещё/)).toHaveCount(0);
  await checkDeliveryLayout(page);
  expect(errors).toEqual([]);
}
