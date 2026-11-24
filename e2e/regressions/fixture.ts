import { type APIRequestContext, type APIResponse, test as base, expect, type Page } from "@playwright/test";
import type { OrderResult, QuoteResponse } from "../../src/shared/contracts/checkout";
import { weekdays } from "../../src/shared/contracts/receiving-time";
import type { SellerProduct } from "../../src/shared/contracts/seller-catalog";
import type { SellerOrder } from "../../src/shared/contracts/seller-order";
import type { SaveReceivingHours, SaveReceivingSettings } from "../../src/shared/contracts/seller-receiving";

const shop = process.env.E2E_BASE_URL ? "e2e" : "test2";
export const storefront = `shop=${shop}`;
export const cabinet = `store=${shop}`;
const sku = "sku-20";
export const point = { lat: 10.7769, lon: 106.7009 };
export const address = "28 Lê Lợi, Хошимин";
const phone = "+84912345678";
const receiving = `/api/seller/receiving/settings?${cabinet}`;
export const command = () => ({ "Idempotency-Key": crypto.randomUUID() });

export async function json<T>(response: APIResponse): Promise<T> {
  expect(response.ok(), `${new URL(response.url()).pathname}: HTTP ${response.status()}`).toBe(true);
  return response.json();
}

type Settings = Omit<SaveReceivingSettings, "expectedRevision"> & {
  revision: number;
};

async function settings(request: APIRequestContext) {
  return json<Settings>(await request.get(receiving));
}

export async function configure(
  request: APIRequestContext,
  change: Partial<Omit<SaveReceivingSettings, "expectedRevision">>,
) {
  const { revision, delivery, pickup, requiredDetails, minimumMinor } = await settings(request);
  return json<Settings>(
    await request.put(receiving, {
      data: { expectedRevision: revision, delivery, pickup, requiredDetails, minimumMinor, ...change },
      headers: command(),
    }),
  );
}

export const anywhere = { mode: "text", payee: "shop", tariff: { kind: "free" } } as const;
export const zone = {
  mode: "map",
  payee: "shop",
  zones: [
    {
      id: "center",
      geometry: { type: "radius", center: point, radiusMeters: 6000 },
      tariff: { kind: "fixed", feeMinor: 25000 },
    },
  ],
} satisfies SaveReceivingSettings["delivery"];

export async function hours(request: APIRequestContext, interval: "day" | "after_order" | "2", empty = false) {
  const data = {
    days: empty ? {} : Object.fromEntries(weekdays.map((day) => [day, [{ start: "09:00", end: "20:00" }]])),
    interval,
    preparationMinutes: 0,
    dayCutoff: "20:00",
  };
  const input: SaveReceivingHours = {
    expectedRevision: (await json<{ revision: number }>(await request.get(`/api/seller/receiving/hours?${cabinet}`)))
      .revision,
    closedDates: [],
    delivery: data,
    pickup: data,
  };
  await json(await request.put(`/api/seller/receiving/hours?${cabinet}`, { data: input, headers: command() }));
}

export async function resume(request: APIRequestContext) {
  const { revision, methods } = await json<{ revision: number; methods: { method: string; pause: unknown }[] }>(
    await request.get(`/api/seller/receiving/pause?${cabinet}`),
  );
  const paused = methods.filter(({ pause }) => pause).map(({ method }) => method);
  if (!paused.length) return;
  await json(
    await request.put(`/api/seller/receiving/pause?${cabinet}`, {
      headers: command(),
      data: { action: "resume", methods: paused, expectedRevision: revision },
    }),
  );
}

export async function orderDetail(request: APIRequestContext, number: number) {
  return json<SellerOrder>(await request.get(`/api/seller/orders/${number}?${cabinet}`));
}

export async function transition(request: APIRequestContext, number: number, data: object) {
  const { revision } = await orderDetail(request, number);
  return json<SellerOrder>(
    await request.post(`/api/seller/orders/${number}/transition?${cabinet}`, {
      data: { ...data, expectedRevision: revision },
      headers: command(),
    }),
  );
}

export async function cleanOrder(request: APIRequestContext, number: number) {
  let order = await orderDetail(request, number);
  if (order.stage === "completed")
    order = await transition(request, number, { action: "rollback", reason: "Завершён учебный прогон QA1" });
  if (order.stage !== "cancelled")
    order = await transition(request, number, { action: "cancel", reason: "Учебный прогон QA1", returnStock: true });
  if (order.balance.refundMinor) await transition(request, number, { action: "markRefundReturned" });
}

export async function restoreCucumber(request: APIRequestContext) {
  const base = "/api/seller/catalog";
  const product = await json<SellerProduct>(await request.get(`${base}/products/product-25?${cabinet}`));
  const item = product.variants.find(({ id }) => id === "sku-25");
  if (!item) throw new Error("Нет учебной фасовки огурцов");
  if (product.salePause === null && item.salePause === null && item.stock === 15) return;
  const result = await json<{ applied: string[] }>(
    await request.post(`${base}/bulk?${cabinet}`, {
      headers: command(),
      data: {
        products: [{ id: product.id, revision: product.revision }],
        action: { kind: "resume", stock: [{ id: item.id, stock: 15, revision: item.stockRevision }] },
      },
    }),
  );
  expect(result.applied).toEqual([product.id]);
}

export async function prepareCart(page: Page, mode: "delivery" | "pickup" = "delivery", quantity = 3) {
  const request = page.request;
  await page.addInitScript((id) => localStorage.setItem(`korzina:${id}:buyer`, "1"), `korzina-demo-${shop}`);
  await json(
    await request.post(`/api/auth/contact?${storefront}`, { data: { phone, confirmed: true }, headers: command() }),
  );
  const cart = await json<{ revision: number }>(await request.get(`/api/cart?${storefront}`));
  const { revision } = await json<{ revision: number }>(
    await request.post(`/api/cart?${storefront}`, {
      data: { action: "set", variantId: sku, quantity, expectedRevision: cart.revision },
      headers: command(),
    }),
  );
  if (mode === "pickup")
    await json(
      await request.post(`/api/receiving?${storefront}`, {
        data: { receiving: { mode }, expectedRevision: revision, complete: true },
        headers: command(),
      }),
    );
}

export async function saveDelivery(page: Page, details = { address, point, apartment: "12" }) {
  const { revision } = await json<{ revision: number }>(await page.request.get(`/api/cart?${storefront}`));
  await json(
    await page.request.post(`/api/receiving?${storefront}`, {
      data: { receiving: { mode: "delivery", ...details }, expectedRevision: revision, complete: true },
      headers: command(),
    }),
  );
}

export async function placeOrder(page: Page, mode: "delivery" | "pickup" = "pickup", extra?: string) {
  await prepareCart(page, mode);
  const request = page.request;
  if (extra) {
    const { revision } = await json<{ revision: number }>(await request.get(`/api/cart?${storefront}`));
    await json(
      await request.post(`/api/cart?${storefront}`, {
        data: { action: "set", variantId: extra, quantity: 1, expectedRevision: revision },
        headers: command(),
      }),
    );
  }
  if (mode === "delivery") await saveDelivery(page);
  const { quoteRevision } = await json<QuoteResponse>(
    await request.post(`/api/quote?${storefront}`, { data: {}, headers: command() }),
  );
  return json<OrderResult>(
    await request.post(`/api/checkout?${storefront}`, {
      data: { payment: "cash", quoteRevision },
      headers: command(),
    }),
  );
}

export const test = base.extend<{ seller: Page; rememberOrder: (number: number) => void; demoPace: undefined }>({
  demoPace: [
    async ({ baseURL }, use) => {
      const started = Date.now();
      await use(undefined);
      // All browser contexts in the nightly run share one runner IP.
      if (baseURL === "https://demo.korzina.app")
        await new Promise((resolve) => setTimeout(resolve, Math.max(0, 20_000 - (Date.now() - started))));
    },
    { auto: true, timeout: 25_000 },
  ],
  extraHTTPHeaders: async ({ extraHTTPHeaders }, use, { testId }) => {
    if (shop === "e2e") return use(extraHTTPHeaders);
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(testId));
    const [subnet, host] = new Uint8Array(hash);
    await use({ ...extraHTTPHeaders, "CF-Connecting-IP": `198.18.${subnet}.${host}` });
  },
  seller: async ({ browser, baseURL, extraHTTPHeaders }, use) => {
    const url = new URL(baseURL ?? "");
    if (!["http://127.0.0.1:5173", "https://demo.korzina.app"].includes(url.origin))
      throw new Error("Регрессии можно запускать только локально и на demo");
    const context = await browser.newContext({ baseURL, extraHTTPHeaders, viewport: { width: 390, height: 844 } });
    try {
      if (shop === "test2") {
        expect((await context.request.post("/__e2e/test2/seller")).status()).toBe(204);
      } else {
        const token = process.env.QA1_SELLER_SESSION;
        if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new Error("Нужна сессия учебного магазина e2e");
        await context.addCookies([
          { name: "korzina_seller", value: token, url: url.origin, httpOnly: true, secure: true },
        ]);
        const identity = await json<{ current: { id: string }; shops: { slug: string }[] }>(
          await context.request.get(`/api/seller/cabinet?${cabinet}`),
        );
        expect(identity.current.id).toBe("korzina-demo-e2e");
        expect(identity.shops.map(({ slug }) => slug)).toEqual(["e2e"]);
      }
      await use(await context.newPage());
    } finally {
      await context.close();
    }
  },
  rememberOrder: async ({ seller }, use) => {
    const orders = new Set<number>();
    try {
      await use((number) => orders.add(number));
    } finally {
      for (const number of orders) await cleanOrder(seller.request, number);
      await restoreCucumber(seller.request);
    }
  },
});
