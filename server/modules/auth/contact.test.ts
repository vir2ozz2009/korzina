import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { beforeAll, expect, it } from "vitest";
import { encryptBotToken } from "../../auth/bot-token";
import { cookieFrom, getAuth, postAuth, signedInitData } from "../../testing/auth";
import { setupPlatform } from "../../testing/platform";
import { catalogSql, catalogStub } from "../catalog/testing";
import { saveReceiving } from "../fulfillment/service";
import { customerAuth } from "./routes";

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

it("подписанный Telegram возврат связывает только исходный браузер и один раз переносит корзину", async () => {
  const token = "12345:korzina-fixture-b9";
  const encryptionKey = "ae".repeat(32);
  await runInDurableObject(catalogStub(), async (_shop, { storage }) => {
    const encrypted = await encryptBotToken(token, shopId, encryptionKey);
    storage.sql.exec(
      "INSERT OR REPLACE INTO settings(key,value) VALUES('telegram_bot_token',?),('telegram_bot_username','korzina_fixture_bot')",
      encrypted,
    );
    const bindings = {
      shop: { id: shopId, slug: "test", name: "Test", status: "active", plan: "base", createdAt: 0 },
      db: drizzle(storage),
      storage,
      secrets: { ENCRYPTION_KEY: encryptionKey },
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

    expect((await submit("/contact", { phone: "+84912345678", confirmed: true }, origin)).status).toBe(200);
    const started = await submit("/telegram/start", {}, origin);
    const { exchange, url } = await started.json<{ exchange: string; url: string }>();
    expect(new URL(url).searchParams.get("startapp")).toBe(exchange);
    expect((await submit("/telegram/finish", { exchange }, origin)).status).toBe(202);
    const other = cookieFrom(await submit("/guest", {}));
    expect((await submit("/telegram/finish", { exchange }, other)).status).toBe(401);
    const initData = await signedInitData(token, { start_param: exchange });
    expect((await submit("/telegram", { initData })).status).toBe(201);
    const consent = await submit("/telegram/finish", { exchange }, origin);
    expect(consent.headers.get("set-cookie")).toBeNull();
    expect(await consent.json()).toEqual({ pending: false, mergeRequired: true });
    expect(storage.sql.exec("SELECT customer FROM carts WHERE customer=?", subject).toArray()).toEqual([
      { customer: subject },
    ]);
    expect((await submit("/telegram/finish", { exchange, merge: true }, other)).status).toBe(401);
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
  });
});
