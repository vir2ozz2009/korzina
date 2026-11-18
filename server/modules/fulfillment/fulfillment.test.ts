import { beforeAll, expect, it, vi } from "vitest";
import { type DeliveryZone, fulfillmentSettingsInput } from "../../../src/shared/contracts/receiving";
import { cookieFrom, getAuth, postAuth } from "../../testing/auth";
import { setupPlatform } from "../../testing/platform";
import { geocodeAddress } from "./geocoder";
import { checkFulfillment, requireFulfillment } from "./service";
import { deliveryZone } from "./zones";

beforeAll(setupPlatform);
const center = { lat: 10.7769, lon: 106.7009 };
const path = "/api/receiving?shop=lavka";
const guest = async () => ({ Cookie: cookieFrom(await postAuth("/api/auth/guest?shop=lavka")) });
const save = (headers: HeadersInit, revision: number, receiving: object, complete?: boolean) =>
  postAuth(path, { expectedRevision: revision, receiving, complete }, headers);
const street = { mode: "delivery", address: "28 Lê Lợi", point: center, apartment: "12" } as const;

it("учитывает границу полигона и радиуса и выбирает самый выгодный тариф в пересечении", () => {
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
    tariff: { kind: "fixed", feeMinor: 5000 },
  };
  expect(deliveryZone([polygon], { lon: 2, lat: 1 })).toEqual(polygon);
  expect(deliveryZone([polygon], { lon: 2.01, lat: 1 })).toBeUndefined();

  const radius: DeliveryZone = {
    id: "radius",
    geometry: { type: "radius", center: { lat: 0, lon: 0 }, radiusMeters: ((Math.PI / 180) * 6_371_008.8) / 100 },
    tariff: { kind: "fixed", feeMinor: 1000 },
  };
  expect(deliveryZone([radius], { lat: 0, lon: 0.01 })).toEqual(radius);
  expect(deliveryZone([radius], { lat: 0, lon: 0.011 })).toBeUndefined();

  const late: DeliveryZone = { ...polygon, id: "late", tariff: { kind: "after_order" } };
  const free: DeliveryZone = { ...polygon, id: "free", tariff: { kind: "free" } };
  expect(deliveryZone([late, polygon, radius], { lat: 0, lon: 0 })?.id).toBe("radius");
  expect(deliveryZone([polygon, free, radius], { lat: 0, lon: 0 })?.id).toBe("free");
  expect(deliveryZone([free, { ...free, id: "same" }], { lat: 0, lon: 0 })?.id).toBe("free");
});

it("рассчитывает фиксированный тариф, предлагает самовывоз вне зоны и возвращает его адрес и часы", async () => {
  const check = (data: object) => postAuth("/api/receiving/check?shop=lavka", data);
  expect(await (await check(street)).json()).toMatchObject({
    available: true,
    zoneId: "center",
    inZone: true,
    tariff: "fixed",
    feeMinor: 25000,
    payee: "shop",
  });
  expect(await (await check({ ...street, point: { lat: 0, lon: 0 } })).json()).toMatchObject({
    available: false,
    inZone: false,
    reason: "outside",
    pickup: { address: expect.any(String) },
  });
  expect(await (await check({ mode: "pickup" })).json()).toMatchObject({
    mode: "pickup",
    available: true,
    pickup: { address: expect.any(String), hours: expect.any(String) },
  });
});

it("при свободном вводе применяет единый тариф, в режиме районов проверяет выбранный район и поля", () => {
  const text = fulfillmentSettingsInput.parse({
    delivery: { mode: "text", tariff: { kind: "free" } },
    acceptingOrders: false,
    requiredDetails: [],
  });
  expect(requireFulfillment(text, { mode: "delivery", address: "Мой адрес" }, true)).toMatchObject({
    available: true,
    tariff: "free",
    feeMinor: 0,
  });

  const districts = fulfillmentSettingsInput.parse({
    delivery: {
      mode: "districts",
      payee: "courier",
      districts: [{ id: "north", name: "Север", tariff: { kind: "fixed", feeMinor: 35000 } }],
    },
    requiredDetails: ["entrance"],
  });
  expect(checkFulfillment(districts, street)).toMatchObject({ available: false, reason: "district_required" });
  expect(() => requireFulfillment(districts, { ...street, districtId: "north" }, true)).toThrow("Укажите подъезд.");
  expect(requireFulfillment(districts, { ...street, districtId: "north", entrance: "1" }, true)).toMatchObject({
    available: true,
    zoneId: "north",
    payee: "courier",
    tariff: "fixed",
    feeMinor: 35000,
  });
});

it("сохраняет ручной адрес и его неподтверждённую зону, новую точку проверяет повторно", async () => {
  const headers = await guest();
  const draft = { mode: "delivery", address: "Мой адрес", apartment: "8" };
  const unconfirmed = await save(headers, 0, draft, true);
  expect(unconfirmed.status).toBe(400);
  const manual = await save(headers, 0, { ...draft, acceptedWithoutPoint: true }, true);
  expect(manual.status).toBe(200);
  expect(await manual.json()).toMatchObject({
    revision: 1,
    receiving: { ...draft, acceptedWithoutPoint: true },
    availability: { available: true, inZone: null, unverified: true, tariff: "after_order", feeMinor: null },
  });
  const verified = await save(headers, 1, { ...draft, point: center, acceptedWithoutPoint: true }, true);
  expect(verified.status).toBe(200);
  const actual = await verified.json<{ receiving: Record<string, unknown> }>();
  expect(actual.receiving).not.toHaveProperty("acceptedWithoutPoint");
  expect(actual).toMatchObject({ revision: 2, availability: { inZone: true, tariff: "fixed" } });
});

it("хранит получение и адреса в своей корзине, проверяет ревизию и не открывает их другой сессии", async () => {
  const headers = await guest();
  const saved = await save(headers, 0, { ...street, entrance: "Б", comment: "Позвоните" }, true);
  expect(saved.status).toBe(200);
  expect((await save(headers, 0, { mode: "pickup" })).status).toBe(409);
  const response = await getAuth(path, headers);
  expect(await response.json()).toMatchObject({
    revision: 1,
    receiving: { ...street, entrance: "Б", comment: "Позвоните" },
    savedAddresses: [{ ...street, entrance: "Б" }],
  });
  const pickup = await save(headers, 1, { mode: "pickup" });
  expect(await pickup.json()).toMatchObject({ revision: 2, receiving: { mode: "pickup" }, savedAddresses: [street] });
  const stranger = await getAuth(path, await guest());
  expect(await stranger.json()).toMatchObject({ receiving: null, savedAddresses: [] });
  expect(await (await getAuth("/api/cart?shop=lavka", headers)).json()).toMatchObject({ revision: 2 });
});

it("геокодер кеширует нормализованный поиск внутри магазина и изолирует магазины", async () => {
  const cache = await caches.open("geocoder-test");
  const request = vi.fn<typeof fetch>(async () =>
    Response.json({
      features: [{ geometry: { coordinates: [center.lon, center.lat] }, properties: { name: "Nhà hát" } }],
    }),
  );
  const search = (shop: string, address: string) =>
    geocodeAddress(shop, { type: "search", address }, cache, async () => true, request);
  expect(await search("one", "  Nhà  hát  ")).toEqual([{ ...center, address: "Nhà hát" }]);
  await search("one", "nhà hát");
  expect(request).toHaveBeenCalledOnce();
  await search("two", "Nhà hát");
  expect(request).toHaveBeenCalledTimes(2);
});

it("обратный поиск использует запасного провайдера и отделяет сбой от пустого ответа", async () => {
  const cache = await caches.open("geocoder-fallback");
  const request = vi.fn<typeof fetch>(async (url) =>
    String(url).includes("photon")
      ? Response.json({ features: [] })
      : Response.json({ display_name: "Nhà hát", lat: String(center.lat), lon: String(center.lon) }),
  );
  expect(await geocodeAddress("one", { type: "reverse", point: center }, cache, async () => true, request)).toEqual([
    { ...center, address: "Nhà hát" },
  ]);
  expect(request).toHaveBeenCalledTimes(2);
  const unavailable = vi.fn<typeof fetch>(async () => new Response(null, { status: 503 }));
  await expect(
    geocodeAddress("one", { type: "search", address: "Nhà hát" }, cache, async () => true, unavailable),
  ).rejects.toMatchObject({ code: "GEOCODER_UNAVAILABLE" });
});
