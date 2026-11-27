import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeAll, expect, it, vi } from "vitest";
import { cookieFrom, getAuth, postAuth } from "../../testing/auth";
import { setupPlatform } from "../../testing/platform";
import { mergeBuyer } from "../buyer/merge";
import { removeOrderedLines } from "../cart/service";
import { catalogSql, catalogStub } from "../catalog/testing";
import { currentSelection } from "./current-selection";
import { parseSelection, readFulfillment, readReceiving, saveReceiving } from "./service";

beforeAll(setupPlatform);
const shop = "korzina-demo-lavka";
const path = "/api/receiving?shop=lavka";
const guest = async () => ({ Cookie: cookieFrom(await postAuth("/api/auth/guest?shop=lavka")) });
const address = { mode: "delivery", address: "28 Lê Lợi", point: { lat: 10.7769, lon: 106.7009 } } as const;

it("BL-14: гость после самовывоза может восстановить введённый адрес с деталями", async () => {
  const headers = await guest();
  const save = (expectedRevision: number, receiving: object, complete?: boolean) =>
    postAuth(path, { expectedRevision, receiving, complete }, headers);
  const delivery = { ...address, apartment: "12", entrance: "Б", comment: "Позвоните" };
  expect((await save(0, delivery, true)).status).toBe(200);
  expect((await save(1, { mode: "pickup" })).status).toBe(200);
  const state = await (await getAuth(path, headers)).json<{ revision: number; deliveryDraft: typeof delivery }>();
  expect(state).toMatchObject({ revision: 2, receiving: { mode: "pickup" }, deliveryDraft: delivery });
  const restored = await save(state.revision, state.deliveryDraft, true);
  expect(restored.status).toBe(200);
  expect(await restored.json()).toMatchObject({ revision: 3, receiving: delivery });
});

it("BL-14: черновик адреса гостя переносится в профиль при входе", async () => {
  await runInDurableObject(catalogStub(), (_instance, { storage }) => {
    const from = "guest:bl14";
    const to = "telegram:9914";
    saveReceiving(storage, from, { expectedRevision: 0, receiving: address });
    saveReceiving(storage, from, { expectedRevision: 1, receiving: { mode: "pickup" } });
    storage.transactionSync(() => mergeBuyer(storage, from, to, { id: shop, mediaOrigin: env.MEDIA_PUBLIC_URL }));
    expect(readReceiving(storage, to)).toMatchObject({ receiving: { mode: "pickup" }, deliveryDraft: address });
    expect(readReceiving(storage, from).receiving).toBeNull();
  });
});

it("BL-15: режим Куда угодно разрешает геокодинг и сохраняет адрес с точкой или без неё", async () => {
  const settings = (await catalogSql("SELECT value FROM settings WHERE key='fulfillment'"))[0]?.value;
  if (typeof settings !== "string") throw new Error("Missing fulfillment fixture");
  const text = { ...JSON.parse(settings), delivery: { mode: "text", tariff: { kind: "free" } }, requiredDetails: [] };
  await catalogSql("UPDATE settings SET value=? WHERE key='fulfillment'", JSON.stringify(text));
  const point = { lat: 48.8566, lon: 2.3522 };
  const name = "12 rue de Rivoli, Paris";
  const spy = vi.fn<typeof fetch>(async () =>
    Response.json({
      features: [{ geometry: { coordinates: [point.lon, point.lat] }, properties: { name } }],
    }),
  );
  vi.stubGlobal("fetch", spy);
  try {
    const headers = await guest();
    const suggestions = await postAuth("/api/receiving/geocode?shop=lavka", { type: "search", address: name }, headers);
    expect(suggestions.status).toBe(200);
    expect(await suggestions.json()).toMatchObject({ results: [{ address: name, ...point }] });
    const withPoint = await postAuth(
      path,
      {
        expectedRevision: 0,
        complete: true,
        receiving: { mode: "delivery", address: name, point },
      },
      headers,
    );
    expect(await withPoint.json()).toMatchObject({
      receiving: { point },
      availability: { available: true, inZone: null, tariff: "free" },
    });
    const manual = await postAuth(
      path,
      {
        expectedRevision: 1,
        complete: true,
        receiving: { mode: "delivery", address: "Дом с синими воротами" },
      },
      headers,
    );
    expect(manual.status).toBe(200);
    const saved = await manual.json<{ receiving: { point?: object } }>();
    expect(saved.receiving).not.toHaveProperty("point");
    expect(saved).toMatchObject({ availability: { available: true, inZone: null, tariff: "free" } });
    expect(spy).toHaveBeenCalledOnce();
  } finally {
    vi.unstubAllGlobals();
    await catalogSql("UPDATE settings SET value=? WHERE key='fulfillment'", settings);
  }
});

it("CART-CLARITY П5–П8/Q1–Q4: явный выбор текущего заказа, legacy, слияние и сброс после checkout", async () => {
  await runInDurableObject(catalogStub(), (_instance, { storage }) => {
    const settings = readFulfillment(storage);
    const legacy = parseSelection(JSON.stringify({ receiving: { mode: "pickup" }, receivingUpdatedAt: Date.now() }));
    expect(currentSelection(legacy, settings)).toMatchObject({ effectiveMode: "delivery", receiving: null });
    const from = "guest:clarity",
      to = "telegram:clarity";
    const chosen = saveReceiving(storage, from, { expectedRevision: 0, receiving: { mode: "pickup" } });
    expect(readReceiving(storage, from)).toMatchObject({ explicitMode: "pickup", receiving: { mode: "pickup" } });
    // Q1/Q2: replacing/repeating goods does not write the receiving column.
    storage.sql.exec("UPDATE carts SET lines='[]' WHERE customer=?", from);
    expect(currentSelection(readReceiving(storage, from), settings).effectiveMode).toBe("pickup");
    storage.transactionSync(() => mergeBuyer(storage, from, to, { id: shop, mediaOrigin: env.MEDIA_PUBLIC_URL }));
    expect(readReceiving(storage, to)).toMatchObject({ explicitMode: "pickup" });
    expect(readReceiving(storage, from).explicitMode).toBeUndefined();
    const cart = { revision: chosen.revision, currency: "VND", lines: [], count: 0, totalMinor: 0, adjustments: [] };
    removeOrderedLines(storage, to, cart, JSON.stringify(readReceiving(storage, to)));
    expect(currentSelection(readReceiving(storage, to), settings)).toMatchObject({
      effectiveMode: "delivery",
      receiving: null,
    });
    const next = readReceiving(storage, to);
    saveReceiving(storage, to, { expectedRevision: next.revision, mode: "delivery" });
    expect(readReceiving(storage, to)).toMatchObject({ explicitMode: "delivery", receiving: null });
    expect(currentSelection(legacy, { ...settings, delivery: undefined }).effectiveMode).toBe("pickup");
    expect(currentSelection(legacy, { ...settings, delivery: undefined, pickup: undefined }).effectiveMode).toBeNull();
  });
});
