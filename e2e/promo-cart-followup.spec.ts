import { expect, type Page, test } from "@playwright/test";
import { exampleFixture, storefrontFixture } from "./promo-cart-fixture";

const money = (value: number) => new RegExp(`${value.toLocaleString("ru-RU").replace(/\s/gu, "\\s")}\\s*₽`);

for (const width of [360, 390]) {
  test(`§5.3 · штатная корзина и шторка из черновика на ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const writes = await exampleFixture(page, false);
    await page.goto("/seller/promotions/proba?store=test2");
    await page.getByRole("button", { name: "Открыть черновик" }).click();
    await page.getByRole("button", { name: "Посмотреть, как видит покупатель" }).click();
    await expect(page.getByRole("heading", { name: "Корзина", exact: true })).toBeVisible();
    const settings = page.locator("details").filter({ hasText: "Тестовые данные · не видны покупателю" });
    await expect(page.getByText("Корзина пуста")).toBeVisible();
    for (const id of ["tomato", "berry"]) {
      await settings.getByRole("combobox", { name: "Фасовка" }).selectOption(id);
      await settings.getByRole("button", { name: "Добавить товар" }).click();
    }
    await settings.getByRole("spinbutton", { name: "Клубника · 250 г" }).fill("4");
    if (await settings.evaluate((node: HTMLDetailsElement) => node.open)) await settings.locator("summary").click();
    const checkout = page.getByRole("button", { name: /^Продолжить/ });
    await expect(checkout).toHaveText(money(1200));
    await expect(checkout).toBeDisabled();
    await page.screenshot({ animations: "disabled", path: test.info().outputPath(`preview-before-${width}.png`) });
    await page.getByRole("button", { name: "Промокод", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Промокод" });
    const input = sheet.getByRole("textbox", { name: "Промокод" });
    await expect(input).toHaveValue("");
    await page.screenshot({ animations: "disabled", path: test.info().outputPath(`preview-sheet-${width}.png`) });
    await input.fill("WRONG");
    await sheet.getByRole("button", { name: "Применить" }).click();
    await expect(sheet.getByText("Код не найден")).toBeVisible();
    await input.fill("PROBA10");
    await sheet.getByRole("button", { name: "Применить" }).click();
    await expect(checkout).toHaveText(money(1080));
    await expect(page.getByText(money(72), { exact: false }).first()).toBeVisible();
    await page.screenshot({ animations: "disabled", path: test.info().outputPath(`preview-applied-${width}.png`) });
    const berry = page.getByRole("listitem").filter({ hasText: "Клубника" });
    for (let i = 0; i < 3; i++) await berry.getByRole("button", { name: "Уменьшить количество" }).click();
    await expect(checkout).toHaveText(money(360));
    for (let i = 0; i < 3; i++) await berry.getByRole("button", { name: "Увеличить количество" }).click();
    await expect(checkout).toHaveText(money(1080));
    await page.getByRole("button", { name: /^PROBA10/ }).click();
    await sheet.getByRole("button", { name: "Убрать" }).click();
    await expect(checkout).toHaveText(money(1200));
    await expect(checkout).toBeDisabled();
    await page.getByRole("button", { name: "Закрыть корзину" }).click();
    await expect(page.getByRole("heading", { name: "Перед запуском" })).toBeVisible();
    await page.getByRole("button", { name: "Изменить условия" }).click();
    await expect(page.getByLabel("Код", { exact: true })).toHaveValue("PROBA10");
    expect(writes).toEqual([]);
  });
}

async function openExample(page: Page, confirmed: boolean) {
  await page.goto("/seller/promotions/proba?store=test2");
  await page.getByRole("button", { name: "Открыть черновик" }).click();
  await page.getByRole("button", { name: "Посмотреть, как видит покупатель" }).click();
  const settings = page.locator("details").filter({ hasText: "Тестовые данные · не видны покупателю" });
  for (const id of ["tomato", "berry"]) {
    await settings.getByRole("combobox", { name: "Фасовка" }).selectOption(id);
    await settings.getByRole("button", { name: "Добавить товар" }).click();
  }
  await settings.getByRole("spinbutton", { name: "Клубника · 250 г" }).fill("4");
  if (!confirmed) await settings.getByText("Подтверждённый покупатель").click();
  await settings.locator("summary").click();
  await expect(page.getByRole("heading", { name: "Корзина", exact: true })).toBeVisible();
}

const totals = (page: Page) => page.getByText("Итого", { exact: true }).locator("..");
const signIn = (page: Page) => page.getByRole("button", { name: "Войти через Telegram", exact: true });
const publicRow = (page: Page) => page.getByRole("button", { name: "Доступные акции", exact: true });
const promoSheet = (page: Page) => page.getByRole("dialog", { name: "Промокод" });

for (const width of [360, 390]) {
  for (const confirmed of [false, true]) {
    for (const shown of [false, true]) {
      const key = `${width}-${confirmed ? "confirmed" : "guest"}-${shown ? "public" : "hidden"}`;
      test(`§5.3 · паритет настоящей корзины и примера ${key}`, async ({ browser, baseURL }) => {
        const options = { baseURL, viewport: { width, height: 844 } };
        const buyer = await browser.newPage(options);
        const example = await browser.newPage(options);
        try {
          await storefrontFixture(buyer, confirmed, shown);
          const requests = await exampleFixture(example, shown);
          await Promise.all([buyer.goto("/cart?shop=test2"), openExample(example, confirmed)]);
          const capture = (stage: string) =>
            Promise.all(
              [buyer, example].map((page, index) =>
                page.screenshot({
                  animations: "disabled",
                  path: test.info().outputPath(`${key}-${stage}-${index === 0 ? "buyer" : "example"}.png`),
                }),
              ),
            );
          for (const page of [buyer, example]) {
            await expect(signIn(page)).toHaveCount(confirmed ? 0 : 1);
            await expect(page.getByRole("button", { name: "У меня нет Telegram" })).toHaveCount(confirmed ? 0 : 1);
            await expect(publicRow(page)).toHaveCount(shown ? 1 : 0);
            await expect(totals(page)).toContainText(money(1200));
            const button = page.getByRole("button", { name: confirmed ? /^Продолжить/ : /^К времени и оплате/ });
            await expect(button).toBeVisible();
            if (confirmed) await expect(button).toHaveText(money(1200));
            else await expect(button).toContainText("Войдите через Telegram или укажите номер");
            if (page === example) await expect(button).toBeDisabled();
            else await expect(button).toBeEnabled();
          }
          await capture("before");
          if (shown) {
            for (const page of [buyer, example]) {
              await publicRow(page).click();
              const dialog = page.getByRole("dialog");
              await dialog.getByRole("button", { name: /Скидка к выходным/ }).click();
              await expect(dialog.getByText("Промокод PROBA10")).toBeVisible();
              await expect(dialog.getByText(money(400))).toBeVisible();
            }
          } else {
            for (const page of [buyer, example]) {
              await page.getByRole("button", { name: "Промокод", exact: true }).click();
              await promoSheet(page).getByRole("textbox").fill("WRONG");
              await promoSheet(page).getByRole("button", { name: "Применить" }).click();
              await expect(promoSheet(page).getByText("Код не найден")).toBeVisible();
              await expect(totals(page)).toContainText(money(1200));
            }
          }
          await capture(shown ? "terms" : "error");
          for (const page of [buyer, example]) {
            if (!shown) await promoSheet(page).getByRole("textbox").fill("PROBA10");
            await page.getByRole("dialog").getByRole("button", { name: "Применить" }).click();
            await expect(totals(page)).toContainText(money(1080));
          }
          await capture("applied");
          for (const page of [buyer, example]) {
            await page.getByRole("button", { name: /^PROBA10/ }).click();
            await promoSheet(page).getByRole("button", { name: "Убрать" }).click();
            await expect(totals(page)).toContainText(money(1200));
          }
          await capture("removed");
          expect(requests).toEqual([]);
        } finally {
          await Promise.all([buyer.close(), example.close()]);
        }
      });
    }
  }
}
