import { expect, type Locator, type Page } from "@playwright/test";

export async function exerciseVariantSave(page: Page, preview: Locator) {
  const attempts: { key?: string; body: { variants?: { id: string; priceMinor: number }[] } }[] = [];
  await page.route(/\/api\/seller\/catalog\/products\/berry(?:\?|$)/, async (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.fallback();
    attempts.push({ key: request.headers()["idempotency-key"], body: request.postDataJSON() });
    if (attempts.length === 1) return route.abort("failed");
    await route.fulfill({ json: { conflicts: [] } });
  });
  const save = preview.getByRole("button", { name: "Сохранить", exact: true });
  await save.click();
  await expect(preview.getByRole("alert")).toContainText("Нет связи");
  await expect(preview.getByRole("heading", { name: "Перед сохранением" })).toBeVisible();
  await save.click();
  await expect(preview).not.toBeVisible();
  await expect(page).toHaveURL(/\/seller\/products(?:\?|$)/);
  expect(attempts).toHaveLength(2);
  expect(attempts[0].key).toBeTruthy();
  expect(attempts[1]).toEqual(attempts[0]);
  expect(attempts[0].body.variants).toMatchObject([
    { id: "berry-0", priceMinor: 49_000 },
    { id: "berry-1", priceMinor: 88_000 },
  ]);
}

export async function checkCartRowPrices(preview: Locator, regular: RegExp, discounted: RegExp) {
  const phase = preview.getByRole("combobox", { name: "Когда смотрит покупатель" });
  const row = preview.getByRole("heading", { name: "Строка корзины" }).locator("..");
  for (const moment of ["before", "after", "during"]) {
    await phase.selectOption(moment);
    await expect(row.getByText(regular)).toHaveCount(1);
    if (moment === "during") {
      const old = row.locator("del");
      const current = row.getByText(discounted);
      await expect(old).toHaveCount(1);
      await expect(old).toHaveText(regular);
      await expect(current).toBeVisible();
      const oldBox = await old.boundingBox();
      const currentBox = await current.boundingBox();
      expect(oldBox?.y).toBeLessThan(currentBox?.y ?? 0);
    } else {
      await expect(row.locator("del")).toHaveCount(0);
      await expect(row.getByText(discounted)).toHaveCount(0);
    }
  }
}
