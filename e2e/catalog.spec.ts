import { type APIRequestContext, expect, type Page, test } from "@playwright/test";
import { browseCatalog, searchCatalog, shopByList } from "./catalog-journeys";
import { freshPage } from "./fresh-page";
import { captureApi, cartClick, openCart, openHome } from "./home-cart";

test("Каталог: категории, поиск и список", async ({ browser, baseURL }) => {
  test.setTimeout(105_000);
  await test.step("B3: категории → подкатегория → товар → назад; бренд и прямые ссылки", () =>
    freshPage(browser, baseURL, browseCatalog));
  await test.step("B5: опечатка, корзина после очистки и возврат со страницы поиска", () =>
    freshPage(browser, baseURL, searchCatalog));
  await test.step("B5b: единые плитки списка, ограничения ввода и ингредиенты блюда", () =>
    freshPage(browser, baseURL, shopByList));
});

test("Корзина: изменения количества и предложения @home-cart", async ({ browser, baseURL }) => {
  test.setTimeout(60_000);
  await test.step("П2, §3.1: от категории и фасовки до удаления и возврата @home-cart", () =>
    freshPage(browser, baseURL, shopAndRestore));
  if (baseURL && new URL(baseURL).hostname === "127.0.0.1")
    await test.step("§3.1: изменение цены и остатка требует принятия @home-cart", () =>
      freshPage(browser, baseURL, (page) => acceptChangedOffer(page, page.request)));
});

async function shopAndRestore(page: Page) {
  const api = captureApi(page);
  await openHome(page, api);
  await page.locator('a[href="/c/home"]').click();
  await page
    .getByRole("link", { name: /Томаты/ })
    .first()
    .click();
  const packs = page.getByRole("group", { name: "Фасовка" });
  await packs.getByRole("button", { name: "500 г", exact: true }).click();
  await cartClick(page, "Добавить в корзину");
  await openCart(page, api);
  await cartClick(page, "Увеличить количество");
  await expect(page.getByRole("status", { name: "Количество", exact: true })).toHaveText("2");
  await cartClick(page, "Уменьшить количество");
  await expect(page.getByRole("status", { name: "Количество", exact: true })).toHaveText("1");
  await cartClick(page, /^Удалить Томаты/);
  await expect(page.getByText("Корзина пуста")).toBeVisible();
  await cartClick(page, "Вернуть");
  await expect(page.getByRole("status", { name: "Количество", exact: true })).toHaveText("1");
  await cartClick(page, /^Удалить Томаты/);
  await expect(page.getByText("Корзина пуста")).toBeVisible();
  expect(api.errors).toEqual([]);
}

async function acceptChangedOffer(page: Page, request: APIRequestContext) {
  const command = async (value: "change" | "restore") => {
    const response = await request.post("/__e2e/test2/tomatoes", { data: value });
    expect(response.status()).toBe(204);
  };
  await command("restore");
  const api = captureApi(page);
  await openHome(page, api);
  await page
    .getByRole("link", { name: /Томаты/ })
    .first()
    .click();
  await page.getByRole("group", { name: "Фасовка" }).getByRole("button", { name: "250 г", exact: true }).click();
  await cartClick(page, "Добавить в корзину");
  await cartClick(page, "Добавить одну штуку");
  try {
    await command("change");
    await openCart(page, api, true);
    const changes = page.getByRole("status").filter({ hasText: "В корзине изменились условия" });
    await expect(changes).toContainText(/90\s000.*52\s000/);
    await expect(page.getByText("Осталось 1")).toBeVisible();
    await cartClick(page, "Принять изменения");
    await expect(changes).toHaveCount(0);
    await expect(page.getByRole("status", { name: "Количество", exact: true })).toHaveText("1");
    expect(api.errors).toEqual([]);
  } finally {
    await command("restore");
  }
}
