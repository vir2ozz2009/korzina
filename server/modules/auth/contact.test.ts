import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { beforeAll, expect, it } from "vitest";
import { cookieFrom, getAuth, postAuth } from "../../testing/auth";
import { setupPlatform } from "../../testing/platform";
import { botFixtureKey, setShopBot } from "../../testing/shop-bot";
import { catalogSql, catalogStub } from "../catalog/testing";
import { buyerOrdersPage } from "../checkout/buyer-orders";
import { favoriteIds, mergeFavoriteIds } from "../favorites/service";
import { readReceiving, saveReceiving, writeReceiving } from "../fulfillment/service";
import { customerAuth } from "./routes";
import { confirmBrowserBuyer } from "./telegram-exchange";

beforeAll(setupPlatform);
const shopId = "korzina-demo-lavka";
const path = "/api/auth/contact?shop=lavka";

it("нормализует телефоны России и Таиланда и никогда не связывает устройства по номеру", async () => {
  await catalogSql("INSERT OR REPLACE INTO settings(key,value) VALUES('phone_region','RU')");
  const save = (phone: string, confirmed: boolean, headers: HeadersInit = {}) =>
    postAuth(path, { phone, confirmed }, headers);
  expect((await save("9991234567", false)).status).toBe(400);
  const first = await save("8 (912) 345-67-89", true);
  const firstCookie = cookieFrom(first);
  expect(await first.json()).toEqual({ phone: "+79123456789", telegramLinked: false });
  const second = await save("8 912 345-67-89", true);
  const secondCookie = cookieFrom(second);
  expect(firstCookie).not.toBe(secondCookie);
  const getSession = async (Cookie: string) =>
    (await getAuth("/api/auth/session?shop=lavka", { Cookie })).json<{ subject: string }>();
  expect((await getSession(firstCookie)).subject).not.toBe((await getSession(secondCookie)).subject);
  await catalogSql("UPDATE settings SET value='TH' WHERE key='phone_region'");
  expect((await save("081", true, { Cookie: secondCookie })).status).toBe(400);
  expect(await (await save("081 234 5678", true, { Cookie: secondCookie })).json()).toEqual({
    phone: "+66812345678",
    telegramLinked: false,
  });
  expect(await (await getAuth(path, { Cookie: firstCookie })).json()).toMatchObject({
    phone: "+79123456789",
    region: "TH",
  });
});

it("§9.3 Telegram переносит заказы, адреса, корзину и избранное ровно один раз после согласия", async () => {
  await setShopBot(env.PLATFORM, shopId, "12345");
  await runInDurableObject(catalogStub(), async (_shop, { storage }) => {
    const bindings = {
      shop: { id: shopId, slug: "test", name: "Test", status: "active", plan: "base", createdAt: 0 },
      db: drizzle(storage),
      storage,
      secrets: { ENCRYPTION_KEY: botFixtureKey },
      platform: env.PLATFORM,
      media: env,
    };
    const submit = (route: string, data: object, cookie?: string) =>
      customerAuth.fetch(
        new Request(`https://demo.korzina.app${route}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": crypto.randomUUID(),
            ...(cookie && { Cookie: cookie }),
          },
          body: JSON.stringify(data),
        }),
        bindings,
      );
    const guest = await submit("/guest", {});
    const origin = cookieFrom(guest);
    const { subject } = await guest.json<{ subject: string }>();
    storage.sql.exec("UPDATE variants SET stock=2 WHERE id='sku-01'");
    const where = { mode: "delivery", address: "28 Lê Lợi", acceptedWithoutPoint: true } as const;
    saveReceiving(storage, subject, { expectedRevision: 0, receiving: where });
    storage.sql.exec(
      "UPDATE carts SET lines=? WHERE customer=?",
      JSON.stringify([{ variantId: "sku-01", quantity: 1 }]),
      subject,
    );
    storage.sql.exec(
      "INSERT INTO carts(customer,lines) VALUES(?,?)",
      "telegram:12345",
      JSON.stringify([
        { variantId: "sku-01", quantity: 3 },
        { variantId: "sku-02", quantity: 1 },
      ]),
    );

    const telegram = "telegram:12345";
    const same = { ...where, id: "same-address", title: "Дом" };
    const guestLocation = readReceiving(storage, subject);
    const accountLocation = readReceiving(storage, telegram);
    writeReceiving(storage, subject, guestLocation.revision, {
      ...guestLocation,
      savedAddresses: [
        { ...same, id: "duplicate-address", address: where.address.toUpperCase() },
        { ...where, id: "work", title: "Работа", address: "45 Lê Lợi" },
      ],
    });
    writeReceiving(storage, telegram, accountLocation.revision, {
      ...accountLocation,
      savedAddresses: [same],
    });
    mergeFavoriteIds(storage, subject, ["product-01", "product-02"]);
    mergeFavoriteIds(storage, telegram, ["product-01", "product-03"]);
    const createOrder = (customer: string) =>
      storage.sql
        .exec<{ number: number }>(
          "INSERT INTO orders(customer,created_at,status,payment_status,snapshot) VALUES(?,?,'placed','unpaid',?) RETURNING number",
          customer,
          Date.now(),
          JSON.stringify({ totalMinor: 49000, currency: "VND", time: null, phone: "+84912345678" }),
        )
        .one().number;
    const sourceOrder = createOrder(subject);
    const existingOrder = createOrder(telegram);

    expect((await submit("/contact", { phone: "+84912345678", confirmed: true }, origin)).status).toBe(200);
    const started = await submit("/telegram/start", {}, origin);
    const { exchange, url } = await started.json<{ exchange: string; url: string }>();
    expect(new URL(url).searchParams.get("start")).toBe(exchange);
    expect((await submit("/telegram/finish", { exchange }, origin)).status).toBe(202);
    const other = cookieFrom(await submit("/guest", {}));
    expect((await submit("/telegram/finish", { exchange }, other)).status).toBe(401);
    expect(await confirmBrowserBuyer(storage, exchange, "12345", "Покупатель")).toBeDefined();
    const consent = await submit("/telegram/finish", { exchange }, origin);
    expect(consent.headers.get("set-cookie")).toBeNull();
    expect(await consent.json()).toEqual({ pending: false, mergeRequired: true });
    expect(storage.sql.exec("SELECT customer FROM carts WHERE customer=?", subject).toArray()).toEqual([
      { customer: subject },
    ]);
    expect(buyerOrdersPage(storage, subject, "active").orders.map(({ number }) => number)).toEqual([sourceOrder]);
    expect(buyerOrdersPage(storage, telegram, "active").orders.map(({ number }) => number)).toEqual([existingOrder]);
    expect(readReceiving(storage, telegram).savedAddresses).toEqual([same]);
    expect(favoriteIds(storage, telegram).slice().sort()).toEqual(["product-01", "product-03"]);
    expect((await submit("/telegram/finish", { exchange, merge: true }, other)).status).toBe(401);
    const beforeOverflow = readReceiving(storage, subject);
    writeReceiving(storage, subject, beforeOverflow.revision, {
      ...beforeOverflow,
      savedAddresses: [
        ...beforeOverflow.savedAddresses,
        ...Array.from({ length: 9 }, (_, i) => ({
          ...where,
          id: `extra-${i}`,
          title: "",
          address: `ул. Ле Лой, ${i + 100}`,
        })),
      ],
    });
    const overflow = await submit("/telegram/finish", { exchange, merge: true }, origin);
    expect(overflow.status).toBe(409);
    expect(await overflow.json()).toMatchObject({ error: { code: "ADDRESS_LIMIT" } });
    expect(buyerOrdersPage(storage, subject, "active").orders.map(({ number }) => number)).toEqual([sourceOrder]);
    expect(readReceiving(storage, telegram).savedAddresses).toEqual([same]);
    expect(favoriteIds(storage, telegram).slice().sort()).toEqual(["product-01", "product-03"]);
    writeReceiving(storage, subject, beforeOverflow.revision, beforeOverflow);

    const finished = await submit("/telegram/finish", { exchange, merge: true }, origin);
    expect(finished.status).toBe(200);
    expect(await finished.json()).toMatchObject({ subject: "telegram:12345", kind: "telegram", pending: false });
    expect((await submit("/telegram/finish", { exchange }, origin)).status).toBe(401);
    const row = storage.sql
      .exec<{ lines: string; receiving: string }>(
        "SELECT lines,receiving FROM carts WHERE customer=?",
        "telegram:12345",
      )
      .one();
    expect(JSON.parse(row.lines)).toEqual([
      { variantId: "sku-01", quantity: 2 },
      { variantId: "sku-02", quantity: 1 },
    ]);
    expect(JSON.parse(row.receiving)).toMatchObject({ receiving: where });
    expect(storage.sql.exec("SELECT * FROM carts WHERE customer=?", subject).toArray()).toEqual([]);
    const accountOrders = () => buyerOrdersPage(storage, telegram, "active").orders.map(({ number }) => number);
    expect(accountOrders()).toEqual([existingOrder, sourceOrder]);
    expect(buyerOrdersPage(storage, subject, "active").orders).toEqual([]);
    expect(readReceiving(storage, telegram).savedAddresses).toEqual([
      same,
      { ...where, id: "work", title: "Работа", address: "45 Lê Lợi" },
    ]);
    expect(favoriteIds(storage, telegram).slice().sort()).toEqual(["product-01", "product-02", "product-03"]);
    expect(favoriteIds(storage, subject)).toEqual([]);

    const archived = await submit("/guest", {});
    const archivedCookie = cookieFrom(archived);
    const { subject: archivedSubject } = await archived.json<{ subject: string }>();
    const archivedOrder = createOrder(archivedSubject);
    expect(storage.sql.exec("SELECT customer FROM carts WHERE customer=?", archivedSubject).toArray()).toEqual([]);
    const attempt = await submit("/telegram/start", {}, archivedCookie);
    const { exchange: archivedExchange } = await attempt.json<{ exchange: string }>();
    expect(await confirmBrowserBuyer(storage, archivedExchange, "12345", "Покупатель")).toBeDefined();
    const archiveConsent = await submit("/telegram/finish", { exchange: archivedExchange }, archivedCookie);
    expect(await archiveConsent.json()).toEqual({ pending: false, mergeRequired: true });
    expect(accountOrders()).toEqual([existingOrder, sourceOrder]);
    storage.sql.exec(
      `INSERT INTO media(id,owner,purpose,status,ready,bytes,mime,request_key,fingerprint,created_at)
       VALUES('current-archive-proof',?,'receipt','attached',1,24,'application/pdf','archive-current','pdf',?),
             ('previous-archive-proof',?,'receipt','attached',1,24,'application/pdf','archive-previous','pdf',?)`,
      archivedSubject,
      Date.now(),
      archivedSubject,
      Date.now(),
    );
    storage.sql.exec("UPDATE orders SET proof_media_id='current-archive-proof' WHERE number=?", archivedOrder);
    storage.sql.exec(
      "INSERT INTO order_receipt_history(order_number,media_id,created_at) VALUES(?,'previous-archive-proof',?)",
      archivedOrder,
      Date.now(),
    );
    const archiveLink = await submit("/telegram/finish", { exchange: archivedExchange, merge: true }, archivedCookie);
    expect(archiveLink.status).toBe(200);
    expect(accountOrders()).toEqual([archivedOrder, existingOrder, sourceOrder]);
    expect(buyerOrdersPage(storage, archivedSubject, "active").orders).toEqual([]);
    expect(
      storage.sql
        .exec("SELECT owner FROM media WHERE id IN ('current-archive-proof','previous-archive-proof')")
        .toArray(),
    ).toEqual([{ owner: telegram }, { owner: telegram }]);

    expect((await submit("/telegram/finish", { exchange: archivedExchange, merge: true }, archivedCookie)).status).toBe(
      401,
    );
    expect(accountOrders()).toEqual([archivedOrder, existingOrder, sourceOrder]);
  });
});
