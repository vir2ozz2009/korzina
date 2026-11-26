import { expect, type Locator, type Page, test } from "@playwright/test";
import type { PromoOffer, PromoTerms } from "../src/shared/contracts/promo";
import { exerciseVariantSave } from "./promo-variant-save";

const draft: PromoOffer = {
  id: "weekend",
  status: "draft",
  revision: 1,
  used: 0,
  orders: 0,
  savingsMinor: 0,
  terms: {
    name: "Скидка к выходным",
    kind: "automatic",
    discount: { type: "percent", value: 1000 },
    scope: { type: "all" },
    confirmed: false,
    minimumMinor: 40_000,
  },
};
const product = { id: "berry", name: "Голубика свежая" };

async function fixtures(page: Page) {
  const shop = {
    id: "fixture",
    slug: "test2",
    name: "Второй магазин",
    promotions: true,
    timeZone: "Asia/Ho_Chi_Minh",
    permissions: ["catalog"],
  };
  await page.route(/\/api\/seller\/cabinet(?:\?|$)/, (route) =>
    route.fulfill({ json: { telegramId: "fixture", current: shop, shops: [shop] } }),
  );
  const variants = [
    ["125 г", 49_000, 61_250],
    ["250 г", 89_000, 116_000],
  ].map(([name, priceMinor, oldPriceMinor], i) => ({
    id: `berry-${i}`,
    name,
    priceMinor,
    oldPriceMinor,
    stock: 10,
    visible: true,
    salePause: null,
    stockRevision: 1,
    purchased: 0,
    promoStartsAt: Date.UTC(2026, 11, 1),
    promoEndsAt: Date.UTC(2026, 11, 3),
  }));
  const prices = variants.map(({ id: variantId, name: variantName, ...variant }) => ({
    productId: product.id,
    productName: product.name,
    variantId,
    variantName,
    ...variant,
    status: "scheduled",
  }));
  let saved = draft;
  let currency = "VND";
  await page.route(/\/api\/seller\/promotions(?:\/[^?]+)?(?:\?|$)/, async (route) => {
    const { pathname } = new URL(route.request().url());
    if (route.request().method() === "POST") {
      saved = { ...saved, revision: saved.revision + 1, terms: route.request().postDataJSON().terms as PromoTerms };
      return route.fulfill({ json: saved });
    }
    if (pathname.endsWith("/catalog"))
      return route.fulfill({
        json: {
          variants: variants.map((v) => ({ id: v.id, name: v.name, productId: product.id, productName: product.name })),
          categories: [{ id: "berries", name: "Ягоды" }],
        },
      });
    if (pathname.endsWith("/weekend")) return route.fulfill({ json: { ...saved, currency } });
    return route.fulfill({ json: { offers: [saved], prices, currency, nextOffset: null } });
  });
  await page.route(/\/api\/seller\/catalog\/access(?:\?|$)/, (route) =>
    route.fulfill({ json: { currency: "VND", canWrite: true } }),
  );
  await page.route(/\/api\/seller\/catalog\/groups\//, (route) => route.fulfill({ json: { groups: [], revision: 0 } }));
  await page.route(/\/api\/seller\/catalog\/products(?:\?|$)/, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            ...product,
            status: "selling",
            revision: 1,
            variantCount: 2,
            priceMinor: 49_000,
            stock: 20,
            salePause: null,
            image: null,
          },
        ],
        revision: 1,
        nextCursor: null,
      },
    }),
  );
  await page.route(/\/api\/seller\/catalog\/products\/berry(?:\?|$)/, (route) => {
    const src = new URL("/assets/catalog/berry-84b15dd4f80f-400.webp", route.request().url()).href;
    return route.fulfill({
      json: {
        ...product,
        status: "selling",
        revision: 1,
        salePause: null,
        description: "",
        ingredients: "",
        storageNotes: "",
        categoryId: null,
        brandId: null,
        recommendations: "auto",
        recommendationIds: [],
        variants,
        photos: [{ id: "berry-photo", image: { src, srcSet: "", original: { src }, width: 400, height: 400 } }],
      },
    });
  });
  return {
    saved: () => saved,
    useRubles: () => {
      currency = "RUB";
    },
  };
}

async function capture(page: Page, dialog: Locator, name: string, width: number, tail = false) {
  await page.evaluate(() => document.fonts.ready);
  const scroll = dialog.locator("div.overflow-y-auto").first();
  await scroll.evaluate((element, bottom) => {
    element.scrollTop = bottom ? element.scrollHeight : 0;
  }, tail);
  await expect.poll(() => dialog.evaluate((elem) => Math.round(elem.getBoundingClientRect().top))).toBe(0);
  expect(await scroll.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0);
  await page.screenshot({ path: `test-results/promo-301/${name}-${width}-app.png`, animations: "disabled" });
}

for (const width of [360, 390]) {
  test(`12.1 · сверка создания, черновика и предпросмотра, ${width} px`, async ({ page }) => {
    const state = await fixtures(page);
    await page.setViewportSize({ width, height: 737 });
    const click = (name: string) => page.getByRole("button", { name, exact: true }).click();
    const form = page.getByRole("dialog", { name: "Условия акции" });
    const choice = form.getByLabel("Способ применения");
    await page.goto("/seller/promotions?store=test2");
    await page.getByLabel("Статус акции").selectOption("draft");
    await click("Создать акцию");
    await page.getByRole("button", { name: /Увеличить сумму заказа/ }).click();
    const goal = page.getByRole("dialog", { name: "Увеличить сумму заказа" });
    await expect(goal.getByRole("button", { name: /Промокод/ })).toHaveCount(0);
    await goal.getByRole("button", { name: /Скидка от суммы/ }).click();
    await expect(choice).toHaveValue("automatic");
    await choice.selectOption("code");
    await expect(form.getByLabel("Код", { exact: true })).toBeVisible();
    await form.getByRole("button", { name: "Назад" }).click();
    await expect(goal).toBeVisible();
    await goal.getByRole("button", { name: "Закрыть" }).click();
    await expect(page.getByLabel("Статус акции")).toHaveValue("draft");
    await click("Создать акцию");
    await page.getByRole("button", { name: /Все виды акций/ }).click();
    await page.getByRole("button", { name: /Промокод/ }).click();
    await expect(choice).toHaveValue("code");
    await form.getByRole("button", { name: "Назад" }).click();
    await page.getByRole("button", { name: /^Скидка Автоматически$/ }).click();
    await expect(form.getByLabel("Название")).toHaveValue("");
    await expect(form.getByLabel("Скидка", { exact: true })).toHaveAccessibleDescription("%");
    await capture(page, form, "create-top", width);
    await capture(page, form, "create-bottom", width, true);
    await page.goto("/seller/promotions/weekend?store=test2");
    await click("Открыть черновик");
    await expect(form.getByLabel("Название")).toHaveValue(draft.terms.name);
    const minimum = form.getByLabel("На какую сумму нужно купить");
    await expect(minimum).toHaveValue("40000");
    await expect(minimum).toHaveAccessibleDescription(/₫.*Учитываются только товары/);
    await expect(form.getByLabel("Сколько штук нужно купить")).toHaveAccessibleDescription(/^шт\./);
    await expect(form.getByLabel("Максимальная скидка за заказ")).toHaveAccessibleDescription("₫");
    await capture(page, form, "edit-top", width);
    await capture(page, form, "edit-bottom", width, true);
    await form.getByLabel("На какие товары").selectOption("categories");
    await form.getByRole("checkbox", { name: "Ягоды" }).check();
    await form.getByLabel("Срок", { exact: true }).selectOption("dates");
    await form.getByLabel("По дату включительно").fill("2026-12-31");
    await form.getByRole("button", { name: "Сохранить черновик" }).click();
    await expect(form).not.toBeVisible();
    await click("Открыть черновик");
    await expect(form.getByRole("checkbox", { name: "Ягоды" })).toBeChecked();
    await expect(form.getByLabel("По дату включительно")).toHaveValue("2026-12-31");
    state.useRubles();
    await page.reload();
    await click("Открыть черновик");
    await form.getByLabel("Размер скидки").selectOption("fixed");
    const fixed = form.getByLabel("Сумма скидки", { exact: true });
    await fixed.fill("12,34");
    await expect(fixed).toBeFocused();
    await expect(fixed).toHaveAccessibleDescription("₽");
    await form.getByRole("button", { name: "Сохранить черновик" }).click();
    await expect(form).not.toBeVisible();
    expect(state.saved().terms.discount).toEqual({ type: "fixed", value: 1234 });

    await page.goto("/seller/promotions?store=test2");
    await page.getByLabel("Статус акции").selectOption("");
    await page.getByRole("button", { name: /Голубика свежая 125 г/ }).click();
    await click("Как увидит покупатель");
    const preview = page.getByRole("dialog", { name: "Как увидит покупатель" });
    const photo = preview.locator("img");
    await expect(photo).toHaveCount(3);
    await expect
      .poll(() =>
        photo.evaluateAll((items: HTMLImageElement[]) => items.every((item) => item.complete && item.naturalWidth > 0)),
      )
      .toBe(true);
    await expect(preview.getByText(product.name, { exact: true })).toHaveCount(4);
    await expect(preview.getByText("125 г", { exact: true })).toHaveCount(4);
    const price = preview.getByText(/49\D000/).first();
    await expect(price).toBeVisible();
    await preview.getByRole("combobox", { name: "Когда смотрит покупатель" }).selectOption("before");
    await expect(preview.getByText(/49\D000/)).toHaveCount(1);
    await preview.getByRole("combobox", { name: "Когда смотрит покупатель" }).selectOption("after");
    await expect(preview.getByText(/49\D000/)).toHaveCount(1);
    await preview.getByRole("combobox", { name: "Когда смотрит покупатель" }).selectOption("during");
    await expect(price).toBeVisible();
    await capture(page, preview, "preview-top", width);
    await capture(page, preview, "preview-bottom", width, true);
    await preview.getByRole("button", { name: "Изменить" }).click();
    await expect(preview).not.toBeVisible();
    await page.goto("/seller/products?store=test2");
    await page.getByRole("button", { name: /Голубика свежая/ }).click();
    await page.getByRole("button", { name: /^250 г/ }).click();
    await click("Как увидит покупатель");
    await expect(preview.getByText(/89\D000/).first()).toBeVisible();
    await expect(preview.getByText(/116\D000/).first()).toBeVisible();
    if (width === 390) {
      await preview.getByRole("button", { name: "Изменить" }).click();
      await page.getByLabel("Цена по акции", { exact: true }).fill("88000");
      await click("Как увидит покупатель");
      await exerciseVariantSave(page, preview);
    }
  });
}
