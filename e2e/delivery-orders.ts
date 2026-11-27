import { expect, type Page } from "@playwright/test";
import { checkDeliveryLayout } from "./delivery-layout";

// The same deployed screens with controlled API data; server transitions are covered by API tests.
export async function checkDeliveryOrders(page: Page, store: string) {
  await page.unrouteAll({ behavior: "wait" });
  const shop = {
    id: "fixture",
    slug: store,
    name: "Второй магазин",
    role: "owner",
    promotions: true,
    permissions: ["orders", "payments", "assembly", "catalog", "settings"],
    timeZone: "Europe/Moscow",
  };
  const terms = {
    name: "Бесплатная доставка от суммы",
    kind: "automatic",
    delivery: true,
    minimumMinor: 60000,
    scope: { type: "all" },
    confirmed: false,
    discount: { type: "fixed", value: 0 },
  };
  const auto = {
    id: "auto-delivery",
    revision: 4,
    status: "active",
    terms,
    used: 0,
    orders: 0,
    savingsMinor: 0,
    currency: "RUB",
  };
  let assigned = false;
  const order = () => ({
    number: 41,
    revision: assigned ? 1 : 0,
    version: assigned ? 1 : 0,
    createdAt: Date.now(),
    currency: "RUB",
    stage: "placed",
    payment: "cash",
    paymentStatus: "confirmed",
    itemsMinor: 60000,
    deliveryMinor: 0,
    totalMinor: 60000,
    time: null,
    phone: "+79990000000",
    customerName: "Учебный покупатель",
    telegramLinked: true,
    receiving: { mode: "delivery", address: "Учебный адрес", apartment: "1" },
    fulfillment: {
      mode: "delivery",
      available: true,
      inZone: true,
      payee: "shop",
      tariff: "after_order",
      feeMinor: assigned ? 12000 : null,
    },
    deliveryBenefit: {
      offerId: "delivery-code",
      revision: 1,
      name: "Доставка по коду",
      code: "SHIP",
      baseMinor: assigned ? 12000 : null,
      quotedBaseMinor: null,
      amountMinor: assigned ? 12000 : 0,
      state: assigned ? "applied" : "reserved",
    },
    lines: [
      {
        variantId: "tomato",
        productId: "tomato",
        name: "Томаты",
        unit: "500 г",
        quantity: 1,
        priceMinor: 60000,
        totalMinor: 60000,
        image: { src: "/seed/tomato-photo-1200.webp", srcSet: "", original: { src: "/seed/tomato-photo-1200.webp" } },
      },
    ],
    permissions: { payments: true, assembly: true, chat: false },
    canCancel: true,
    canReplaceProof: false,
    packed: [],
    receipts: [],
    events: [],
    handedOff: false,
    readyForPickup: false,
    deliveryAssigned: assigned,
    paymentRequired: false,
    timeZone: shop.timeZone,
    balance: {
      paidMinor: 60000,
      outstandingMinor: 0,
      debtMinor: 0,
      refundMinor: 0,
      latestPayment: { method: "cash", amountMinor: 60000 },
    },
  });
  await page.route(/\/api\/seller\/cabinet(?:\?|$)/, (route) =>
    route.fulfill({ json: { current: shop, shops: [shop], telegramId: "fixture" } }),
  );
  await page.route(/\/api\/auth\/(guest|telegram|contact|session)(?:\?|$)/, (route) =>
    route.fulfill({ json: { kind: "telegram", telegramLinked: true, subject: null } }),
  );
  await page.route(/\/api\/favorites(?:\?|$)/, (route) => route.fulfill({ json: { ids: [] } }));
  await page.route(/\/api\/cart(?:\?|$)/, (route) =>
    route.fulfill({ json: { revision: 0, currency: "RUB", lines: [], count: 0, totalMinor: 0, adjustments: [] } }),
  );
  await page.route(/\/api\/seller\/orders(?:\/[^?]+)?(?:\?|$)/, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/badge")) return route.fulfill({ json: { rev: 0, count: 0 } });
    if (path.endsWith("/transition")) {
      expect(route.request().postDataJSON()).toMatchObject({
        action: "setDeliveryFee",
        amountMinor: 12000,
        expectedRevision: 0,
      });
      assigned = true;
    }
    return route.fulfill({ json: order() });
  });
  await page.route(/\/api\/orders\/41(?:\?|$)/, (route) => route.fulfill({ json: order() }));
  await page.route(/\/api\/seller\/receiving\/(settings|pause)(?:\?|$)/, (route) =>
    route.fulfill({
      json: new URL(route.request().url()).pathname.endsWith("/pause")
        ? {
            revision: 1,
            canWrite: true,
            adminPaused: false,
            timeZone: shop.timeZone,
            methods: [{ method: "delivery", pause: null }],
          }
        : {
            revision: 2,
            canWrite: true,
            currency: "RUB",
            maps: false,
            mapsFallback: false,
            minimumMinor: 0,
            requiredDetails: [],
            delivery: { mode: "text", payee: "shop", tariff: { kind: "fixed", feeMinor: 12000 } },
          },
    }),
  );
  await page.route(/\/api\/seller\/promotions(?:\/[^?]+)?(?:\?|$)/, (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      json: path.endsWith("/delivery-policy")
        ? { offer: auto }
        : path.endsWith("/catalog")
          ? { variants: [], categories: [] }
          : path.endsWith("/report")
            ? {
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
              }
            : path.endsWith("/promotions")
              ? { offers: [auto], prices: [], currency: "RUB", nextOffset: null }
              : auto,
    });
  });
  await page.goto(`/orders/41?shop=${store}`);
  await expect(page.getByText("Доставка будет бесплатной по промокоду", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/a6/buyer-late-reserved-390.png", fullPage: true });
  await page.goto(`/seller/orders/41?store=${store}`);
  await expect(page.getByText("Доставка будет бесплатной по промокоду", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Назначить стоимость доставки", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Стоимость доставки" });
  await dialog.getByLabel("Сумма", { exact: true }).fill("120");
  await dialog.getByRole("button", { name: "Сохранить стоимость", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/К доплате за доставку 0 ₽/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Назначить стоимость доставки", exact: true })).toHaveCount(0);
  await page.screenshot({ path: "test-results/a6/seller-late-assigned-390.png", fullPage: true });
  await page.goto(`/orders/41?shop=${store}`);
  await expect(page.getByText("Доставка бесплатно по промокоду", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Доплат/ })).toHaveCount(0);
  await checkDeliveryLayout(page, "buyer-late-assigned-390");
  await page.goto(`/seller/receiving?store=${store}`);
  const entry = page.getByRole("button", { name: /Бесплатная доставка от суммы/ });
  await expect(entry).toBeVisible();
  await page.screenshot({ path: "test-results/a6/settings-base-and-link-390.png", fullPage: true });
  await entry.click();
  await expect(page).toHaveURL(/\/seller\/promotions\/auto-delivery/);
  await expect(page.getByText(terms.name, { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: "test-results/a6/same-policy-from-settings-390.png", fullPage: true });
}
