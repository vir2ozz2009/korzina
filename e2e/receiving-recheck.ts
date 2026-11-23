import { expect, type Page, type Route, test } from "@playwright/test";
import type { AvailabilityDay } from "../src/shared/contracts/receiving-time";

const availability = "**/api/receiving/availability?**";

async function overrideAvailability(
  route: Route,
  update: (days: AvailabilityDay[]) => AvailabilityDay[],
  mode = "slots",
) {
  const response = await route.fetch();
  const data = await response.json();
  await route.fulfill({ response, json: { ...data, mode, days: update(data.days) } });
}

export async function checkClosedReceivingDay(page: Page, checkAddressAfterReload: () => Promise<void>) {
  await test.step("§14.5 · выходной у покупателя отмечен отдельно от заполненного дня", async () => {
    await page.route(availability, (route) =>
      overrideAvailability(route, (days) =>
        days.map((day, index) =>
          index === 3
            ? { ...day, available: false, reason: "closed", intervals: [] }
            : index === 4
              ? { ...day, available: false, reason: "full" }
              : day,
        ),
      ),
    );
    // The screen starts loading availability as soon as the saved address is restored.
    await page.reload();
    await checkAddressAfterReload();
    await page.getByRole("button", { name: /Когда привезти/ }).click();
    const sheet = page.getByRole("dialog", { name: /Когда привезти/ });
    await sheet.getByRole("button", { name: "Другой день" }).click();
    await expect(sheet.getByText("Не работаем", { exact: true })).toBeVisible();
    await expect(sheet.getByText("Занято", { exact: true })).toBeVisible();
    await page.screenshot({ path: "test-results/receiving-closed-day-390.png", animations: "disabled" });
    await sheet.getByRole("button", { name: "Назад", exact: true }).click();
    await expect(sheet).toBeHidden();
    await page.unroute(availability);
  });
}

export async function checkChangedReceivingTime(page: Page) {
  await test.step("§14.3 · в начатой корзине смена режима сбрасывает сохранённый интервал", async () => {
    await page.route(availability, (route) =>
      overrideAvailability(route, (days) => days.map((day) => ({ ...day, intervals: [] })), "day"),
    );
    await page.getByRole("button", { name: /Когда привезти.*\d{2}:\d{2}/ }).click();
    const sheet = page.getByRole("dialog", { name: /Когда привезти/ });
    await expect(sheet.getByRole("button", { name: "Выбрать день", exact: true })).toBeEnabled();
    await sheet.getByRole("button", { name: "Назад", exact: true }).click();
    await expect(page.getByText("Время изменилось, выберите заново", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Когда привезти.*\d{2}:\d{2}/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Выбрать время/ })).toBeEnabled();
    await page.screenshot({ path: "test-results/receiving-time-changed-390.png", animations: "disabled" });
    const cart = await page.request.get("/api/receiving?shop=test2");
    expect(cart.ok()).toBe(true);
    expect(await cart.json()).toMatchObject({ time: null });
    await page.unroute(availability);
  });
}
