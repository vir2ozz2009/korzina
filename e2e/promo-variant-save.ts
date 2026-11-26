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
