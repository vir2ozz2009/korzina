import { expect } from "@playwright/test";
import { periodLabel } from "../../src/features/seller/ui/sales/dates";
import { cabinet, test } from "./fixture";

for (const { path, api, content } of [
  { path: "/seller/money", api: "/api/seller/money", content: /^Получено$/ },
  {
    path: "/seller/money/operations",
    api: "/api/seller/money/operations",
    content: /^(Операций нет|Поступление|Возврат)$/,
  },
]) {
  test(`Блок 11 · сценарий 10 повторяет чтение за выбранный период (${path})`, { tag: "@regression" }, async ({
    seller,
  }) => {
    const context = seller.context();
    await seller.goto(`${path}?${cabinet}`);
    const loaded = seller.getByText(content).first();
    await expect(loaded).toBeVisible();
    const documentStart = await seller.evaluate(() => performance.timeOrigin);
    const period = seller.getByRole("button", { name: "Период", exact: true });
    const sheet = seller.getByRole("dialog", { name: "Период", exact: true });
    await period.click();
    await expect(sheet).toBeVisible();

    await context.setOffline(true);
    try {
      await sheet.getByRole("button", { name: "Последние 7 дней", exact: true }).click();
      const error = seller.getByRole("alert").filter({ hasText: "Нет соединения" });
      await expect(error).toBeVisible();
      await expect(period).toBeVisible();
      await expect(loaded).toHaveCount(0);
      const selected = new URL(seller.url());
      const from = selected.searchParams.get("from");
      const to = selected.searchParams.get("to");
      if (!from || !to) throw new Error("В URL нет выбранного периода");
      expect(from).not.toBe(to);
      const dates = seller.getByText(periodLabel({ from, to }), { exact: true });
      await expect(dates).toBeVisible();

      await context.setOffline(false);
      const response = seller.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.pathname === api && url.searchParams.get("from") === from && url.searchParams.get("to") === to;
      });
      await error.getByRole("button", { name: "Повторить", exact: true }).click();
      expect((await response).ok()).toBeTruthy();
      await expect(error).toBeHidden();
      await expect(loaded).toBeVisible();
      await expect(period).toBeVisible();
      await expect(dates).toBeVisible();
      await expect(seller).toHaveURL(selected.href);
      expect(await seller.evaluate(() => performance.timeOrigin)).toBe(documentStart);
    } finally {
      await context.setOffline(false);
    }
  });
}
