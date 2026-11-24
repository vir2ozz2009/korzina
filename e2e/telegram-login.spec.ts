import { once } from "node:events";
import { createServer } from "node:http";
import { expect, type Page, test } from "@playwright/test";
import { freshPage } from "./fresh-page";
import { checkStaffInvite } from "./team-invite";
import { checkBrowserLogin } from "./telegram-browser-login";

const miniAppInitData = "telegram-init-data-fixture";

function stubMiniApp(page: Page) {
  return page.addInitScript((initData) => {
    const noop = () => {};
    window.Telegram = {
      WebApp: {
        initData,
        viewportHeight: 844,
        isExpanded: true,
        colorScheme: "light",
        BackButton: { show: noop, hide: noop, onClick: noop, offClick: noop },
        ready: noop,
        expand: noop,
        setHeaderColor: noop,
        setBackgroundColor: noop,
        onEvent: noop,
        offEvent: noop,
      },
    };
  }, miniAppInitData);
}

async function checkBuyerMiniApp(page: Page) {
  await stubMiniApp(page);
  let signedIn = false;
  await page.route(/\/api\/auth\/telegram(?:\?|$)/, (route) => {
    expect(route.request().postDataJSON()).toEqual({ initData: miniAppInitData });
    signedIn = true;
    return route.fulfill({ json: { kind: "telegram" } });
  });
  await page.route(/\/api\/auth\/contact(?:\?|$)/, (route) =>
    route.fulfill({ json: { phone: null, region: "VN", telegramLinked: signedIn } }),
  );
  await page.route(/\/api\/profile(?:\?|$)/, (route) =>
    route.fulfill({ json: { name: "Покупатель Mini App", telegramLinked: true, platformAdmin: false } }),
  );
  await page.goto("/profile?shop=test2");
  await expect(page.getByRole("heading", { name: "Покупатель Mini App" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

async function openTelegramFrame(page: Page, baseURL: string | undefined, path: string) {
  const target = new URL(path, baseURL);
  const body = `<iframe src="${target.href.replaceAll("&", "&amp;")}" width="375" height="790"></iframe>`;
  // A real loopback response gives Chromium the parent's network address space.
  await using localParent =
    target.hostname === "127.0.0.1"
      ? createServer((_request, response) => response.writeHead(200, { "Content-Type": "text/html" }).end(body))
      : undefined;
  let parent = "https://web.telegram.org/korzina-mini-app-fixture";
  if (localParent) {
    localParent.listen(0, "127.0.0.1");
    await once(localParent, "listening");
    const address = localParent.address();
    if (!address || typeof address === "string") throw new Error("Missing loopback fixture address");
    parent = `http://localhost:${address.port}/korzina-cabinet-fixture`;
  } else {
    await page.route(parent, (route) => route.fulfill({ contentType: "text/html", body }));
  }
  await page.goto(parent);
  return page.frameLocator("iframe");
}

async function checkEmbeddedBuyerChat(page: Page, baseURL: string | undefined) {
  const token = "b".repeat(64);
  await stubMiniApp(page);
  await page.route(/\/api\/auth\/telegram(?:\?|$)/, (route) => {
    const { bearer } = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: { kind: "telegram", ...(bearer && { token }) } });
  });
  await page.route(/\/api\/orders\/chat\/9(?:\?|$)/, async (route) => {
    if ((await route.request().headerValue("authorization")) !== `Bearer ${token}`)
      return route.fulfill({ status: 401, json: { error: { code: "AUTH_REQUIRED" } } });
    return route.fulfill({ json: { entries: [], writable: true } });
  });
  const storefront = await openTelegramFrame(page, baseURL, "/orders/9/chat?shop=test2");
  await expect(storefront.getByRole("button", { name: "Открыть заказ №9", exact: true })).toBeVisible();
  await expect(storefront.getByRole("textbox", { name: "Сообщение" })).toBeVisible();
  await page.locator("iframe").screenshot({ path: "test-results/telegram-embedded-buyer-chat-390.png" });
}

async function checkEmbeddedCabinet(page: Page, baseURL: string | undefined) {
  const token = "c".repeat(64);
  const shop = {
    slug: "test2",
    name: "Второй магазин",
    status: "active",
    storefrontUrl: new URL("/?shop=test2", baseURL).href,
  };
  let signIns = 0;
  await stubMiniApp(page);
  await page.route(/\/api\/seller\/cabinet\/telegram(?:\?|$)/, (route) => {
    signIns++;
    expect(route.request().postDataJSON()).toEqual({ initData: miniAppInitData, store: "test2", bearer: true });
    return route.fulfill({ json: { ok: true, token } });
  });
  await page.route(/\/api\/seller\/cabinet(?:\?|$)/, async (route) => {
    const request = route.request();
    const authorization = await request.headerValue("authorization");
    if (authorization !== `Bearer ${token}`)
      return route.fulfill({ status: 401, json: { error: { code: "UNAUTHORIZED" } } });
    expect(new URL(request.url()).searchParams.get("store")).toBe("test2");
    expect((await request.headerValue("cookie")) ?? "").not.toContain("korzina_seller=");
    return route.fulfill({ json: { telegramId: "100", current: shop, shops: [shop] } });
  });
  const cabinet = await openTelegramFrame(page, baseURL, "/seller?shop=test2&store=test2");
  const parent = page.url();
  await expect(cabinet.getByRole("heading", { name: "Второй магазин" }).first()).toBeVisible();
  const open = cabinet.getByRole("button", { name: "Открыть витрину как покупатель", exact: true });
  await expect(open).toBeVisible();
  expect(signIns).toBe(1);
  await page.locator("iframe").screenshot({ path: "test-results/telegram-embedded-cabinet-390.png" });
  await page.route(/\/api\/shop\?/, async (route) => {
    const request = route.request();
    expect(await request.headerValue("x-korzina-preview-shop")).toBe("test2");
    if ((await request.headerValue("x-korzina-preview-session")) !== token)
      return route.fulfill({ status: 404, json: { error: { code: "SHOP_NOT_FOUND" } } });
    return route.fulfill({
      json: { ...shop, id: "korzina-demo-test2", status: "draft", plan: "base", features: {}, teamPreview: true },
    });
  });
  const returnAction = cabinet.getByRole("button", { name: "Вернуться в кабинет", exact: true });
  await open.click();
  await expect(returnAction).toBeVisible();
  await expect(cabinet.getByText("Предпросмотр для команды", { exact: true })).toBeVisible();
  expect(page.url()).toBe(parent);
  await returnAction.click();
  await expect(open).toBeVisible();
  expect(page.url()).toBe(parent);
}

test("Вход в Telegram: buyer", async ({ browser, baseURL }) => {
  test.setTimeout(70_000);
  await test.step("BL-3/BL-5: buyer resumes Telegram login and closes the prompt", () =>
    freshPage(browser, baseURL, (page) => checkBrowserLogin(page, baseURL, "buyer")));
  await test.step("BL-5: Mini App signs in with initData without opening the login sheet", () =>
    freshPage(browser, baseURL, checkBuyerMiniApp));
  await test.step("Блок 10 · личный чат покупателя в Telegram Web без cookie", () =>
    freshPage(browser, baseURL, (page) => checkEmbeddedBuyerChat(page, baseURL)));
});

test("Вход в Telegram: seller", async ({ browser, baseURL }) => {
  test.setTimeout(70_000);
  await test.step("BL-3/BL-5: seller resumes Telegram login and closes the prompt", () =>
    freshPage(browser, baseURL, (page) => checkBrowserLogin(page, baseURL, "seller")));
  await test.step("§9.12: a seller can open the selected shop in Telegram Web without cookies", () =>
    freshPage(browser, baseURL, (page) => checkEmbeddedCabinet(page, baseURL)));
  if (baseURL && new URL(baseURL).hostname === "127.0.0.1")
    await test.step("Блок 8: приглашение сборщика, одноразовая ссылка и отзыв доступа", () =>
      checkStaffInvite(browser, baseURL));
});
