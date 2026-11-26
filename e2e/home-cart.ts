import { expect, type Locator, type Page } from "@playwright/test";

export function captureApi(page: Page) {
  const errors: string[] = [];
  const calls: string[] = [];
  let cartReadResponded = false;
  let receivingStartedBeforeCartResponse = false;
  page.on("response", (response) => {
    if (new URL(response.url()).pathname === "/api/cart" && response.request().method() === "GET")
      cartReadResponded = true;
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path === "/api/receiving" && !cartReadResponded) receivingStartedBeforeCartResponse = true;
    if (path.startsWith("/api/")) calls.push(`${request.method()} ${path}`);
  });
  return {
    errors,
    expectBudget(allowed: string[]) {
      const actual = calls.splice(0);
      const available = [...allowed];
      for (const call of actual) {
        const index = available.indexOf(call);
        expect(index, `Unexpected request ${call}. Recorded: ${actual.join(", ")}`).toBeGreaterThanOrEqual(0);
        available.splice(index, 1);
      }
      return actual;
    },
    receivingStartedInParallel: () => receivingStartedBeforeCartResponse,
    reset: () => {
      calls.length = 0;
      cartReadResponded = false;
      receivingStartedBeforeCartResponse = false;
    },
  };
}

const localWorker = (page: Page) => new URL(page.url()).hostname === "127.0.0.1";

export async function openHome(page: Page, api: ReturnType<typeof captureApi>) {
  await page.clock.setFixedTime(new Date("2026-11-19T06:00:00Z"));
  await page.goto("/?shop=test2");
  await expect(page.getByRole("link", { name: /Томат/i }).first()).toBeVisible();
  const actual = api.expectBudget([
    // StrictMode in Vite dev can restart active mount requests once.
    ...(localWorker(page) ? ["GET /api/cart", "GET /api/catalog/document"] : []),
    "GET /api/cart",
    "GET /api/auth/contact",
    "GET /api/catalog/document",
    "GET /api/catalog/live",
  ]);
  expect(actual).toEqual(
    expect.arrayContaining(["GET /api/cart", "GET /api/catalog/document", "GET /api/catalog/live"]),
  );
  expect(actual.indexOf("GET /api/cart")).toBeLessThan(actual.indexOf("GET /api/catalog/live"));
}

export async function openCart(page: Page, api: ReturnType<typeof captureApi>, review = false) {
  api.reset();
  const summary = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/checkout/summary" && response.ok(),
  );
  await page.getByRole("button", { name: /^Корзина/ }).click();
  const ready = review
    ? page.getByRole("button", { name: "Принять изменения" })
    : page.getByRole("button", { name: "Увеличить количество" });
  await expect(ready).toBeEnabled();
  await summary;
  const actual = api.expectBudget([
    "GET /api/cart",
    "GET /api/auth/contact",
    "GET /api/receiving",
    "GET /api/checkout/summary",
    // Public offers load once for a settled cart, separately from the purchase summary.
    "GET /api/cart/promotions",
    ...(review ? ["GET /api/checkout/summary"] : []),
    ...(localWorker(page) ? ["GET /api/auth/contact", "GET /api/receiving", "GET /api/checkout/summary"] : []),
  ]);
  expect(actual).toEqual(expect.arrayContaining(["GET /api/cart", "GET /api/receiving", "GET /api/checkout/summary"]));
  expect(api.receivingStartedInParallel()).toBe(true);
}

export async function cartClick(page: Page, name: RegExp | string, scope: Locator | Page = page) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/cart" && response.request().method() === "POST",
    ),
    scope.getByRole("button", { name }).click(),
  ]);
  expect(response.ok()).toBe(true);
}
