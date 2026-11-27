import { expect, type Page, test } from "@playwright/test";
import { type Candidate, calculatePromo, promoLabel } from "../server/modules/promo/calculate";
import { cartTotals } from "../src/shared/cart-totals";
import type { CartLine } from "../src/shared/contracts/cart";

const total = (page: Page) => page.getByText("Итого", { exact: true }).locator("..");
const money = (value: number) => String(value);
const item: CartLine = {
  variantId: "a",
  productId: "a",
  name: "Товар",
  unit: "шт",
  quantity: 2,
  priceMinor: 100,
  stock: 12,
  available: true,
};
const automatic: Candidate = {
  id: "bundle",
  revision: 1,
  status: "active",
  used: 0,
  personalUsed: 0,
  terms: {
    name: "Комбо",
    kind: "automatic",
    confirmed: false,
    scope: { type: "all" },
    discount: { type: "fixed", value: 0 },
  },
};
const fulfillment = {
  pickup: { address: "Самовывоз", hours: "09:00–20:00" },
  acceptingOrders: true,
  unavailable: {},
  savedAddresses: [],
  addressesRevision: 0,
  requiredDetails: [],
};
export async function checkOptimalBundles(page: Page) {
  const lines = [..."abc"].map((id) => ({
    ...item,
    variantId: id,
    productId: id,
    name: `Товар ${id.toUpperCase()}`,
    quantity: 2,
    priceMinor: 100,
  }));
  const offers: Candidate[] = ["ab", "ac", "bc"].map((id) => ({
    ...automatic,
    id,
    terms: {
      ...automatic.terms,
      name: `Комбо ${id.toUpperCase()}`,
      scope: { type: "all" },
      group: {
        type: "bundle",
        priceMinor: 150,
        limit: null,
        components: [...id].map((variantId) => ({ variantId, quantity: 1 })),
      },
    },
  }));
  let revision = 1;
  const cart = () =>
    calculatePromo(
      { revision, currency: "VND", ...cartTotals(lines) },
      offers,
      { confirmed: false, completed: 0, exactUsed: false },
      (terms) => promoLabel(terms, String),
    );
  await page.route(/\/api\/(cart|checkout\/summary|receiving|auth\/contact)(\/|\?|$)/, (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/cart/promotions") return route.fulfill({ json: [] });
    if (path === "/api/auth/contact") return route.fulfill({ json: { phone: null, telegramLinked: true } });
    if (path === "/api/receiving")
      return route.fulfill({
        json: {
          ...fulfillment,
          receiving: { mode: "pickup" },
          revision,
          availability: { mode: "pickup", available: true, feeMinor: 0 },
        },
      });
    if (path === "/api/cart" && request.method() === "POST") {
      const { variantId, quantity } = request.postDataJSON();
      const line = lines.find((line) => line.variantId === variantId);
      if (line) line.quantity = quantity;
      revision++;
    }
    return route.fulfill({
      json:
        path === "/api/checkout/summary"
          ? { ...cart(), deliveryMinor: 0, acceptingOrders: true, shortMinor: 0, minimumMinor: 0 }
          : cart(),
    });
  });
  await page.goto("/cart?shop=test2");
  await expect(total(page)).toContainText(money(450));
  await page.screenshot({ path: test.info().outputPath("triangle-450.png"), fullPage: true });
  const row = page.getByRole("listitem").filter({ hasText: "Товар A" });
  await row.getByRole("button", { name: "Уменьшить количество" }).click();
  await expect(total(page)).toContainText(money(400));
  await row.getByRole("button", { name: "Увеличить количество" }).click();
  await expect(total(page)).toContainText(money(450));
  await page.reload();
  await expect(total(page)).toContainText(money(450));
  await page.getByRole("button", { name: /^Продолжить/ }).click();
  await expect(page).toHaveURL(/\/checkout\/receiving/);
}
