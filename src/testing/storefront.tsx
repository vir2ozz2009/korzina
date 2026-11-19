import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { cleanup, configure, render } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, vi } from "vitest";
import { createQueryClient } from "../app/query-defaults";
import { cartContract } from "../shared/contracts/cart";
import {
  catalogDocumentContract,
  catalogListContract,
  catalogOffersContract,
  catalogProductContract,
} from "../shared/contracts/catalog";
import { shopContextContract } from "../shared/contracts/shop-context";

const shop = shopContextContract.parse({
  id: "korzina-demo-test2",
  slug: "test2",
  name: "Второй магазин",
  status: "active",
  plan: "base",
  createdAt: 1794873600000,
  features: {},
  theme: null,
});
configure({ asyncUtilTimeout: 700 });

let routes: typeof import("../routes/shop-routes");
let root: typeof import("../routes/root");

beforeAll(async () => {
  const context = document.createElement("script");
  context.id = "shop-context";
  context.type = "application/json";
  context.textContent = JSON.stringify(shop);
  document.head.appendChild(context);
  [root, routes] = await Promise.all([import("../routes/root"), import("../routes/shop-routes")]);
});
beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-11-19T06:00:00Z"), toFake: ["Date"] });
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

export function storefront(path: string, handler: (url: URL, init?: RequestInit) => Response | Promise<Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: URL, init?: RequestInit) => handler(new URL(url), init)),
  );
  const qc = createQueryClient();
  qc.setDefaultOptions({ queries: { ...qc.getDefaultOptions().queries, retry: false } });
  const router = createRouter({
    routeTree: root.rootRoute.addChildren(routes.shopRoutes),
    history: createMemoryHistory({ initialEntries: [path] }),
    context: { qc },
    defaultPendingMinMs: 0,
  });
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

export const cartLine = {
  variantId: "sku-01",
  productId: "product-01",
  name: "Томаты",
  unit: "500 г",
  quantity: 1,
  priceMinor: 45000,
  stock: 3,
  available: true,
};
export const emptyCart = cartContract.parse({
  revision: 0,
  currency: "VND",
  count: 0,
  totalMinor: 0,
  adjustments: [],
  lines: [],
});
export const filledCart = cartContract.parse({
  ...emptyCart,
  revision: 1,
  count: 1,
  totalMinor: 45000,
  lines: [cartLine],
});
const variants = [
  { id: "sku-01", name: "500 г", photoId: null },
  { id: "sku-02", name: "1 кг", photoId: null },
];
const tile = { id: "product-01", name: "Томаты", categoryId: "home", brandId: null, image: null, variants };
export const catalog = catalogDocumentContract.parse({
  catalogVersion: 1,
  count: 1,
  next: null,
  brands: [],
  items: [tile],
  categories: [{ id: "home", name: "Овощи", parentId: null, hasProducts: true, image: null }],
});
export const offers = catalogOffersContract.parse({
  catalogVersion: 1,
  currency: "VND",
  hideOutOfStock: false,
  items: variants.map(({ id }, i) => ({
    id,
    productId: tile.id,
    priceMinor: 45000 * (i + 1),
    oldPriceMinor: null,
    stock: 3,
    visible: true,
    available: true,
  })),
});
export const list = catalogListContract.parse({ ...catalog, offers });
export const product = catalogProductContract.parse({
  ...tile,
  currency: "VND",
  recommendations: { items: [], offers: [] },
  catalogVersion: 1,
  description: "",
  brandName: null,
  images: [],
  variants: variants.map((variant, i) => ({ ...variant, ...offers.items[i] })),
});
