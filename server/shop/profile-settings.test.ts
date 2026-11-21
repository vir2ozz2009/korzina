import { exports } from "cloudflare:workers";
import { beforeAll, expect, it } from "vitest";
import { getAuth, postAuth, sellerFixture } from "../testing/auth";
import { setupPlatform } from "../testing/platform";

beforeAll(setupPlatform);
const path = (section: string) => `/api/seller/profile/${section}?store=lavka`;
const put = (section: string, body: object, headers: Record<string, string>) =>
  exports.default.fetch(
    new Request(`https://demo.korzina.app${path(section)}`, {
      method: "PUT",
      body: JSON.stringify(body),
      headers: { ...headers, "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
    }),
  );

it("§9.2 §11.3 продавец меняет данные и пояс, страна, валюта и адрес витрины защищены", async () => {
  const { headers } = await sellerFixture("korzina-demo-lavka");
  const employee = await sellerFixture("korzina-demo-lavka", "employee");
  const profile = {
    name: "Хлеб и мёд",
    logo: null,
    timeZone: "Europe/Moscow",
    address: "45 Lê Lợi",
    phone: "+7 900 123-45-67",
    email: "shop@example.invalid",
    telegram: "@example_shop",
  };
  const data = { ...profile, expectedRevision: 0 };
  expect(await (await getAuth(path("data"), employee.headers)).json()).toMatchObject({ canWrite: false });
  expect((await put("data", data, employee.headers)).status).toBe(403);
  for (const field of ["country", "currency", "slug"])
    expect((await put("data", { ...data, [field]: "value" }, headers)).status).toBe(403);
  await getAuth("/api/shop?shop=lavka");
  const response = await put("data", data, headers);
  expect(response.status, await response.clone().text()).toBe(200);
  expect(await response.json()).toMatchObject({ profile, revision: 1 });
  expect((await put("data", data, headers)).status).toBe(409);
  expect(await (await getAuth("/api/shop?shop=lavka")).json()).toMatchObject({
    name: profile.name,
    timeZone: profile.timeZone,
    profile: { address: profile.address, email: profile.email },
  });
  expect(await (await getAuth("/api/receiving/availability?shop=lavka&method=pickup")).json()).toMatchObject({
    timeZone: profile.timeZone,
  });
  expect(await (await getAuth("/api/checkout/support?shop=lavka")).json()).toEqual([
    { title: profile.phone, href: "tel:+79001234567" },
    { title: profile.email, href: "mailto:shop@example.invalid" },
    { title: "Telegram", href: "https://t.me/example_shop" },
  ]);
  expect(await (await postAuth(path("time-zone"), { lat: 10.7769, lon: 106.7009 }, headers)).json()).toEqual({
    timeZone: "Asia/Ho_Chi_Minh",
  });
});

it("§9.1 §9.2 US-M12 сохранённый цвет доступен на витрине, почти белый отклоняется", async () => {
  const { headers } = await sellerFixture("korzina-demo-lavka");
  await getAuth("/api/shop?shop=lavka");
  expect((await put("theme", { expectedRevision: 0, theme: { custom: "#fefefe" } }, headers)).status).toBe(400);
  const theme = { custom: "#a24375" };
  const response = await put("theme", { expectedRevision: 0, theme }, headers);
  expect(response.status, await response.clone().text()).toBe(200);
  expect(await (await getAuth("/api/shop?shop=lavka")).json()).toMatchObject({ theme });
});
