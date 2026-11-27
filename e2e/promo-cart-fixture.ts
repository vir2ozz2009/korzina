import type { Page } from "@playwright/test";
import type { PromoOffer, PublicPromo } from "../src/shared/contracts/promo";

const offer: PromoOffer = {
  id: "proba",
  revision: 1,
  status: "draft",
  used: 0,
  orders: 0,
  savingsMinor: 0,
  terms: {
    name: "Скидка к выходным",
    kind: "code",
    code: "PROBA10",
    discount: { type: "percent", value: 1000 },
    scope: { type: "all" },
    confirmed: false,
    minimumMinor: 40_000,
  },
};
const products = [
  { id: "tomato", name: "500 г", productName: "Томаты розовые", priceMinor: 8000 },
  { id: "berry", name: "250 г", productName: "Клубника", priceMinor: 28000 },
];
const fulfillment = {
  pickup: { address: "Москва, ул. Садовая, 7", hours: "Ежедневно, 09:00–20:00" },
  delivery: { mode: "text", payee: "shop" },
  acceptingOrders: true,
  unavailable: {},
};
const fixedLines = [
  { variantId: "tomato", quantity: 1 },
  { variantId: "berry", quantity: 4 },
];

type Line = (typeof fixedLines)[number];

function quote(lines: Line[], code: string | null, shown: boolean) {
  const itemsMinor = lines.reduce(
    (sum, line) => sum + (products.find(({ id }) => id === line.variantId)?.priceMinor ?? 0) * line.quantity,
    0,
  );
  const missingMinor = Math.max(0, 40_000 - itemsMinor);
  const applied = code === "PROBA10" && !missingMinor;
  const totalMinor = itemsMinor - (applied ? itemsMinor / 10 : 0);
  const rows = lines.map(({ variantId, quantity }) => {
    const product = products.find(({ id }) => id === variantId);
    if (!product) throw new Error("Неизвестный тестовый товар");
    return {
      variantId,
      productId: variantId,
      name: product.productName,
      unit: product.name,
      quantity,
      stock: 15,
      available: true,
      priceMinor: product.priceMinor,
      totalMinor: product.priceMinor * quantity * (applied ? 0.9 : 1),
    };
  });
  const publicOffer: PublicPromo = {
    id: "example",
    name: offer.terms.name,
    kind: "code",
    code: "PROBA10",
    discount: offer.terms.discount,
    minimumMinor: 40_000,
    scopeNames: ["Все товары"],
    confirmed: false,
    applicable: !missingMinor,
    missingMinor: missingMinor || undefined,
  };
  return {
    lines: rows,
    count: rows.reduce((sum, row) => sum + row.quantity, 0),
    itemsMinor,
    totalMinor,
    payableMinor: totalMinor,
    adjustments: applied
      ? [
          {
            kind: "promotion",
            sourceId: "example",
            label: "По промокоду PROBA10",
            amount: -itemsMinor / 10,
            allocations: rows.map(({ variantId, priceMinor, quantity }) => ({
              variantId,
              amount: (priceMinor * quantity) / 10,
            })),
          },
        ]
      : [],
    revision: 0,
    currency: "RUB",
    promo: code ? { code, reason: applied ? "applied" : code === "PROBA10" ? "minimum" : "unknown", missingMinor } : {},
    publicOffers: shown && lines.length ? [publicOffer] : [],
    timeZone: "Europe/Moscow",
    fulfillment,
    method: "pickup",
    deliveryMinor: 0,
  };
}

export async function exampleFixture(page: Page, shown: boolean) {
  const shop = { id: "test-shop", slug: "test2", name: "Korzina", promotions: true, permissions: ["catalog"] };
  const buyerRequests: string[] = [];
  await page.route(/\/api\/(cart|checkout|quote|receiving|orders|auth\/(contact|guest|telegram))(\/|\?|$)/, (route) => {
    buyerRequests.push(new URL(route.request().url()).pathname);
    return route.fulfill({ status: 500 });
  });
  await page.route(/\/api\/seller\/cabinet(?:\?|$)/, (route) =>
    route.fulfill({ json: { telegramId: "fixture", current: shop, shops: [shop] } }),
  );
  await page.route(/\/api\/seller\/promotions(?:\/[^?]+)?(?:\?|$)/, (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith("/proba"))
      return route.fulfill({ json: { ...offer, terms: { ...offer.terms, publicInCart: shown }, currency: "RUB" } });
    if (pathname.endsWith("/catalog"))
      return route.fulfill({
        json: { variants: products.map((product) => ({ ...product, productId: product.id })), categories: [] },
      });
    if (pathname.endsWith("/report")) return route.fulfill({ status: 503 });
    if (!pathname.endsWith("/example")) return route.fulfill({ json: { offers: [], prices: [], currency: "RUB" } });
    const { terms, enteredCode, lines, automatic, confirmed, completed } = route.request().postDataJSON() as {
      terms: { publicInCart?: boolean };
      enteredCode: string | null;
      lines: Line[];
      automatic?: boolean;
      confirmed: boolean;
      completed: number;
    };
    return route.fulfill({
      json: {
        ...quote(automatic ? fixedLines : lines, enteredCode, !!terms.publicInCart),
        confirmed: automatic ? true : confirmed,
        completed: automatic ? 0 : completed,
      },
    });
  });
  return buyerRequests;
}

export async function storefrontFixture(page: Page, confirmed: boolean, shown: boolean) {
  let code: string | null = null;
  let revision = 1;
  await page.route(/\/api\/(cart|checkout\/summary|receiving|auth\/(contact|guest))(\/|\?|$)/, (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const cart = () => ({ ...quote(fixedLines, code, shown), revision });
    switch (pathname) {
      case "/api/cart/promotions":
        return route.fulfill({ json: cart().publicOffers });
      case "/api/receiving":
        return route.fulfill({ json: { ...fulfillment, receiving: { mode: "pickup" }, revision } });
      case "/api/auth/guest":
        return route.fulfill({ json: {} });
      case "/api/auth/contact":
        return route.fulfill({ json: { phone: null, telegramLinked: confirmed } });
      case "/api/checkout/summary":
        return route.fulfill({ json: { ...cart(), acceptingOrders: true, shortMinor: 0, minimumMinor: 0 } });
      case "/api/cart": {
        if (request.method() === "GET") return route.fulfill({ json: cart() });
        const input = request.postDataJSON() as { promoAction: string; code?: string };
        if (input.code && input.code !== "PROBA10")
          return route.fulfill({
            status: 400,
            json: {
              error: { message: "Промокод не применён", code: "VALIDATION", details: { promo: { reason: "unknown" } } },
            },
          });
        code = input.code ?? null;
        revision++;
        return route.fulfill({ json: cart() });
      }
      default:
        return route.fallback();
    }
  });
}
