import { exports } from "cloudflare:workers";
import { beforeAll, expect, it, vi } from "vitest";
import { getAuth, sellerFixture } from "../../testing/auth";
import { setupPlatform } from "../../testing/platform";
import { buy, customer, getQuote, setupCheckout } from "../checkout/testing";
import { deliveryCities } from "./city";
import { pauseDeadline } from "./pause";
import { checkFulfillment, resolveFulfillment } from "./service";
import { scheduleFromHours } from "./settings";

beforeAll(async () => {
  await setupPlatform();
  await setupCheckout();
});

const url = (section: string) => `https://demo.korzina.app/api/seller/receiving/${section}?store=lavka`;
const write = (section: string, body: object, headers: Record<string, string>, key = crypto.randomUUID()) =>
  exports.default.fetch(
    new Request(url(section), {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify(body),
    }),
  );

it("§9.3 §12.1 §13.3 §13.5 пауза блокирует старый checkout по способу, плашка видна только при включении", async () => {
  const { headers } = await sellerFixture("korzina-demo-lavka", "employee");
  const delivery = await customer("sku-01", {
    mode: "delivery",
    address: "28 Lê Lợi",
    apartment: "12",
    point: { lat: 10.7769, lon: 106.7009 },
  });
  const pickup = await customer("sku-01");
  const deliveryQuote = await getQuote(delivery);
  const pickupQuote = await getQuote(pickup);
  const pause = {
    action: "pause",
    methods: ["delivery"],
    term: "manual",
    showBanner: false,
    message: "Скрытый текст",
    expectedRevision: 0,
  };
  const key = crypto.randomUUID();
  const first = await write("pause", pause, headers, key);
  expect(first.status, await first.clone().text()).toBe(200);
  expect(await first.json()).toMatchObject({
    revision: 1,
    methods: [
      { method: "delivery", pause: { message: "", showBanner: false } },
      { method: "pickup", pause: null },
    ],
  });
  expect(await (await write("pause", pause, headers, key)).json()).toMatchObject({ revision: 1 });
  expect((await write("pause", pause, headers)).status).toBe(409);
  const receiving = () => getAuth("/api/receiving?shop=lavka");
  expect(await (await receiving()).json()).toMatchObject({
    banner: null,
    acceptingOrders: true,
    unavailable: { delivery: "Сейчас недоступно" },
  });
  expect(
    await (await buy("checkout", { quoteRevision: deliveryQuote.quoteRevision, payment: "cash" }, delivery)).json(),
  ).toMatchObject({ error: { code: "SHOP_CLOSED", message: "Сейчас недоступно" } });
  expect((await buy("checkout", { quoteRevision: pickupQuote.quoteRevision, payment: "cash" }, pickup)).status).toBe(
    201,
  );
  const visible = { ...pause, expectedRevision: 1, showBanner: true, message: "Откроемся позже" };
  expect((await write("pause", visible, headers)).status).toBe(200);
  expect(await (await receiving()).json()).toMatchObject({ banner: expect.stringContaining("Откроемся позже") });
  expect((await write("pause", { action: "resume", methods: ["delivery"], expectedRevision: 2 }, headers)).status).toBe(
    200,
  );
  expect(await (await receiving()).json()).toMatchObject({ banner: null, unavailable: {} });
});

it("§11.2 §12.3 карты выключены: применяется цена первой зоны, исходные зоны остаются", () => {
  const geometry = { type: "radius", center: { lat: 1, lon: 2 }, radiusMeters: 100 };
  const stored = JSON.stringify({
    delivery: {
      mode: "map",
      zones: [
        { id: "first", geometry, tariff: { kind: "fixed", feeMinor: 300 } },
        { id: "second", geometry, tariff: { kind: "free" } },
      ],
    },
  });
  const receiving = { mode: "delivery", address: "Адрес" } as const;
  expect(checkFulfillment(resolveFulfillment(stored, false), receiving)).toMatchObject({
    available: true,
    feeMinor: 300,
  });
  expect(resolveFulfillment(stored, true).delivery).toMatchObject({
    mode: "map",
    zones: [{ id: "first" }, { id: "second" }],
  });
});

it("§9.3 сроки паузы считают час и следующую полночь в часовом поясе магазина", () => {
  const now = Date.parse("2026-11-19T21:30:00Z");
  expect(pauseDeadline("hour", now, "Asia/Ho_Chi_Minh")).toBe(Date.parse("2026-11-19T22:30:00Z"));
  expect(pauseDeadline("day", now, "Asia/Ho_Chi_Minh")).toBe(Date.parse("2026-11-20T17:00:00Z"));
  expect(pauseDeadline("day", now, "America/New_York")).toBe(Date.parse("2026-11-20T05:00:00Z"));
  expect(pauseDeadline("manual", now, "Asia/Ho_Chi_Minh")).toBeNull();
});

it("§12.4 интервалы нарезаются внутри рабочих часов, выходные даты сохраняются", () => {
  const hours = scheduleFromHours(
    {
      days: { mon: [{ start: "09:00", end: "14:00" }] },
      interval: "2",
      preparationMinutes: 60,
      dayCutoff: "18:00",
    },
    ["2026-12-31"],
  );
  expect(hours.days.mon).toEqual([
    { start: "09:00", end: "11:00" },
    { start: "11:00", end: "13:00" },
    { start: "13:00", end: "14:00" },
  ]);
  expect(hours.closedDates).toEqual(["2026-12-31"]);
});

it("§12.3 границу города читаем из кеша, без границы остаётся центр для радиуса", async () => {
  const cache = await caches.open("seller-city-test");
  const center = { display_name: "Город", lat: "10", lon: "20" };
  const provider = vi.fn<typeof fetch>(async () =>
    Response.json([
      {
        ...center,
        geojson: {
          type: "Polygon",
          coordinates: [
            [
              [20, 10],
              [21, 10],
              [21, 11],
              [20, 10],
            ],
          ],
        },
      },
      center,
    ]),
  );
  const lookup = (city: string) => deliveryCities(city, cache, async () => true, provider);
  const results = await lookup("Город");
  expect(results).toMatchObject([
    {
      center: { lat: 10, lon: 20 },
      boundary: [
        { lat: 10, lon: 20 },
        { lat: 10, lon: 21 },
        { lat: 11, lon: 21 },
      ],
    },
    { center: { lat: 10, lon: 20 }, boundary: null },
  ]);
  expect(await lookup("город")).toEqual(results);
  expect(provider).toHaveBeenCalledOnce();
});

it("§11.3 сотрудник читает настройки получения и часов, изменить их может владелец", async () => {
  const { headers } = await sellerFixture("korzina-demo-lavka", "employee");
  expect(await (await getAuth("/api/seller/receiving/settings?store=lavka", headers)).json()).toMatchObject({
    canWrite: false,
  });
  expect((await write("settings", { expectedRevision: 0, minimumMinor: 0 }, headers)).status).toBe(403);
  expect((await write("hours", { expectedRevision: 0, delivery: { days: {} }, closedDates: [] }, headers)).status).toBe(
    403,
  );
});

it("§11.6 минимум из S4 действует в B10 и сохраняет настройки способов оплаты", async () => {
  const { headers } = await sellerFixture("korzina-demo-lavka");
  const buyer = await customer("sku-01");
  const before = await getQuote(buyer);
  const url = "/api/seller/receiving/settings?store=lavka";
  const { revision, delivery, pickup, requiredDetails } = await (await getAuth(url, headers)).json<{
    revision: number;
    delivery: unknown;
    pickup: unknown;
    requiredDetails: unknown;
  }>();
  const settings = {
    expectedRevision: revision,
    delivery,
    pickup,
    requiredDetails,
    minimumMinor: before.itemsMinor + 1,
  };
  expect((await write("settings", settings, headers)).status).toBe(200);
  expect(await (await buy("quote", {}, buyer)).json()).toMatchObject({ error: { code: "MIN_ORDER_SUM" } });
  expect(
    (await write("settings", { ...settings, expectedRevision: revision + 1, minimumMinor: 0 }, headers)).status,
  ).toBe(200);
  expect((await getQuote(buyer)).paymentSettings).toEqual(before.paymentSettings);
});
