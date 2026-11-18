import { beforeAll, expect, it, vi } from "vitest";
import type { DeliveryZone } from "../../../src/shared/contracts/receiving";
import { cookieFrom, getAuth, postAuth } from "../../testing/auth";
import { setupPlatform } from "../../testing/platform";
import { geocodeAddress } from "./geocoder";
import { deliveryZone } from "./zones";

beforeAll(setupPlatform);
const center = { lat: 10.7769, lon: 106.7009 };

it("граница включена в зону доставки для полигона и радиуса", () => {
  const polygon: DeliveryZone = {
    id: "polygon",
    geometry: {
      type: "polygon",
      points: [
        { lon: 0, lat: 0 },
        { lon: 2, lat: 0 },
        { lon: 2, lat: 2 },
        { lon: 0, lat: 2 },
      ],
    },
    tariff: { kind: "store", amountMinor: 5000 },
  };
  expect(deliveryZone([polygon], { lon: 1, lat: 1 })).toEqual(polygon);
  expect(deliveryZone([polygon], { lon: 2, lat: 1 })).toEqual(polygon);
  expect(deliveryZone([polygon], { lon: 2.01, lat: 1 })).toBeUndefined();
  const radius: DeliveryZone = {
    id: "radius",
    geometry: { type: "radius", center: { lat: 0, lon: 0 }, radiusMeters: ((Math.PI / 180) * 6_371_008.8) / 100 },
    tariff: { kind: "courier", amountMinor: 1000 },
  };
  expect(deliveryZone([radius], { lat: 0, lon: 0.005 })).toEqual(radius);
  expect(deliveryZone([radius], { lat: 0, lon: 0.01 })).toEqual(radius);
  expect(deliveryZone([radius], { lat: 0, lon: 0.011 })).toBeUndefined();
});

it("доставка возвращает тариф зоны или доступный самовывоз; самовывоз возвращает адрес и часы", async () => {
  const check = (data: object) => postAuth("/api/fulfillment/check?shop=lavka", data);
  expect(await (await check({ mode: "delivery", address: "Nhà hát", point: center })).json()).toMatchObject({
    available: true,
    zoneId: "center",
    tariff: { kind: "store", amountMinor: 25000 },
  });
  expect(await (await check({ mode: "delivery", address: "Далеко", point: { lat: 0, lon: 0 } })).json()).toMatchObject({
    available: false,
    pickup: { address: expect.any(String) },
  });
  expect(await (await check({ mode: "pickup" })).json()).toMatchObject({
    mode: "pickup",
    available: true,
    address: expect.any(String),
    hours: expect.any(String),
  });
});

it("три последних адреса сохраняются после повторного запроса, чужой сеанс их не видит", async () => {
  const cookie = cookieFrom(await postAuth("/api/auth/guest?shop=lavka"));
  const path = "/api/fulfillment/addresses?shop=lavka";
  for (const address of ["Le Loi 1", "Le Loi 2", "Le Loi 3", "Le Loi 4", "le loi 2"]) {
    const response = await postAuth(path, { address, point: center }, { Cookie: cookie });
    expect(response.status).toBe(200);
    await response.arrayBuffer();
  }
  expect(await (await getAuth(path, { Cookie: cookie })).json()).toEqual({
    addresses: ["le loi 2", "Le Loi 4", "Le Loi 3"].map((address) => ({ address, point: center })),
  });
  expect(await (await getAuth(path)).json()).toEqual({ addresses: [] });
  const fallback = await postAuth("/api/fulfillment/geocode?shop=lavka", { address: "Le Loi 2" }, { Cookie: cookie });
  expect(fallback.status).toBe(503);
});

it("геокодер использует заглушку провайдера, кеширует по нормализованному адресу и изолирует магазины", async () => {
  const cache = await caches.open("geocoder-test");
  const request = vi.fn(async () => Response.json({ results: [{ ...center, formatted: "Nhà hát" }] }));
  expect(await geocodeAddress("one", "  Nhà  hát  ", "test-key", cache, request)).toEqual({
    ...center,
    formatted: "Nhà hát",
  });
  expect(await geocodeAddress("one", "nhà hát", "test-key", cache, request)).toEqual({
    ...center,
    formatted: "Nhà hát",
  });
  expect(request).toHaveBeenCalledOnce();
  await geocodeAddress("two", "Nhà hát", "test-key", cache, request);
  expect(request).toHaveBeenCalledTimes(2);
});
