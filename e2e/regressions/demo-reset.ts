import { request } from "@playwright/test";
import type { SellerOrderPage } from "../../src/shared/contracts/seller-order";
import { anywhere, cabinet, cleanOrder, configure, hours, json, restoreCucumber, resume } from "./fixture.ts";

const baseURL = "https://demo.korzina.app";
const token = process.env.QA1_SELLER_SESSION;
if (process.env.E2E_BASE_URL !== baseURL || !token || !/^[a-f0-9]{64}$/.test(token))
  throw new Error("Восстановление разрешено только для учебного магазина на demo");
const api = await request.newContext({ baseURL, extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
try {
  const identity = await json<{ current: { id: string }; shops: { id: string }[] }>(
    await api.get(`/api/seller/cabinet?${cabinet}`),
  );
  if (identity.current.id !== "korzina-demo-e2e" || identity.shops.length !== 1)
    throw new Error("Учебная сессия должна открывать только магазин e2e");
  const orders = `/api/seller/orders?${cabinet}`;
  const { orders: active, cursor } = await json<SellerOrderPage>(await api.get(orders));
  if (cursor) throw new Error("В учебном магазине неожиданно больше одной страницы активных заказов");
  for (const { number } of active) await cleanOrder(api, number);
  await restoreCucumber(api);
  await configure(api, { delivery: anywhere, requiredDetails: [], minimumMinor: 120000 });
  await resume(api);
  await hours(api, "2");
} finally {
  await api.dispose();
}
