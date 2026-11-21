import { expect, type Page, test } from "@playwright/test";
import type { Schedule } from "../src/shared/contracts/receiving-time";
import type { SaveReceivingHours } from "../src/shared/contracts/seller-receiving";

const path = "**/api/seller/receiving/hours?**";
const timeZone = "Asia/Ho_Chi_Minh";

export async function checkShopHours(page: Page, query: string) {
  let revision = 0;
  let schedule: Schedule | null = null;
  const writes: SaveReceivingHours[] = [];
  await page.clock.setFixedTime(new Date("2026-11-21T05:00:00Z"));
  await page.route(path, (route) => {
    if (route.request().method() === "PUT") {
      writes.push(route.request().postDataJSON());
      schedule = null;
      revision++;
    }
    const { expectedRevision: _, ...settings } = writes.at(-1) ?? {};
    return route.fulfill({
      json: { revision, canWrite: true, timeZone, schedule, settings: revision ? settings : null },
    });
  });

  const common = page.getByRole("region", { name: "Когда принимаете заказы" });
  const save = page.getByRole("button", { name: "Сохранить", exact: true });
  const openHours = () => page.goto(`/seller/hours?${query}`);
  await openHours();

  await test.step("§14.8 · вёрстка и заголовок при прокрутке на 360, 390 и 412 px", async () => {
    await checkHoursWidths(page);
  });
  await test.step("§14.1 · одни часы по умолчанию и отдельный самовывоз по кнопке", async () => {
    const pickup = page.getByRole("region", { name: "Самовывоз", exact: true });
    await expect(common).toBeVisible();
    await expect(pickup).toHaveCount(0);
    await common.getByRole("button", { name: "Для самовывоза другие часы" }).click();
    await expect(pickup.getByRole("combobox", { name: "Открытие" })).toHaveValue("09:00");
    await pickup.getByRole("combobox", { name: "Открытие" }).selectOption("11:00");
    await expect(
      page.getByRole("region", { name: "Когда принимаете доставку" }).getByRole("combobox", { name: "Открытие" }),
    ).toHaveValue("09:00");
    await pickup.getByRole("button", { name: "Общие часы для самовывоза" }).click();
    await expect(pickup).toHaveCount(0);
  });
  await test.step("§14.2 · семь кнопок дней, общее время и один диапазон на каждый выбранный день", async () => {
    const days = common.getByRole("group", { name: "Рабочие дни" });
    await expect(days.getByRole("button")).toHaveCount(7);
    await expect(common.getByRole("combobox", { name: "Открытие" })).toHaveValue("09:00");
    await days.getByRole("button", { name: "Вс" }).click();
    await expect(days.getByRole("button", { name: "Вс" })).toHaveAttribute("aria-pressed", "false");
    await common.getByRole("button", { name: "Разное время по дням" }).click();
    await expect(common.getByRole("combobox", { name: /^Открытие / })).toHaveCount(6);
    await common.getByRole("combobox", { name: "Открытие Пн" }).selectOption("10:00");
    await expect(common.getByRole("combobox", { name: "Открытие Вт" })).toHaveValue("09:00");
    await expect(common.getByRole("button", { name: /Убрать часы|Добавить часы/ })).toHaveCount(0);
  });
  await test.step("§14.3 · три режима времени и длительности 1, 2 и 3 часа", async () => {
    await expect(common.getByRole("radio")).toHaveCount(3);
    await common.getByRole("radio", { name: "Только день, в течение дня" }).check();
    await expect(common.getByRole("combobox", { name: "Длительность интервала" })).toHaveCount(0);
    await common.getByRole("radio", { name: "Договоримся после заказа" }).check();
    await expect(common.getByRole("radio", { name: "Договоримся после заказа" })).toBeChecked();
    await common.getByRole("radio", { name: "Ко времени", exact: true }).check();
    const duration = common.getByRole("combobox", { name: "Длительность интервала" });
    await expect(duration.locator("option")).toHaveCount(3);
    await duration.selectOption("3");
  });
  await test.step("§14.4 · четыре срока подготовки и передача «на следующий день»", async () => {
    const prep = common.getByRole("group", { name: "Сколько готовите заказ" });
    await expect(prep.getByRole("button")).toHaveCount(4);
    await prep.getByRole("button", { name: "На следующий день" }).click();
    await expect(prep.getByRole("button", { name: "На следующий день" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Дополнительно", { exact: true })).toHaveCount(0);
  });
  await test.step("§14.5 · календарь блокирует прошлое, чип сохраняется общей кнопкой и удаляется", async () => {
    await page.getByRole("button", { name: "+ Выбрать дату" }).click();
    const calendar = page.getByRole("dialog", { name: "Выбрать дату" });
    await expect(calendar.getByRole("button", { name: /20 ноября 2026/ })).toBeDisabled();
    await calendar.getByRole("button", { name: "Следующий месяц" }).click();
    await calendar.getByRole("button", { name: /31 декабря 2026/ }).click();
    const chip = page.getByRole("button", { name: "Убрать выходной 2026-12-31" });
    await expect(chip).toHaveText("31 дек ✕");
    await expect(page.locator("input[type=date]")).toHaveCount(0);
    await save.click();
    await expect(save).toBeHidden();
    expect(writes.at(-1)).toMatchObject({ closedDates: ["2026-12-31"], delivery: { preparation: "next_day" } });
    await chip.click();
    await expect(chip).toHaveCount(0);
  });
  await test.step("§14.6 · лимит выключен по умолчанию, задаётся и снимается", async () => {
    const field = common.getByLabel("Не больше заказов в интервал");
    await expect(field).toHaveCount(0);
    await common.getByRole("button", { name: "Ограничить число заказов" }).click();
    await field.fill("5");
    await save.click();
    await expect(save).toBeHidden();
    expect(writes.at(-1)?.delivery.capacity).toBe(5);
    await common.getByRole("button", { name: "Снять ограничение" }).click();
    await expect(field).toHaveCount(0);
  });
  await test.step("§14.7 · строка покупателя меняется сразу при редактировании", async () => {
    const preview = common.getByRole("status", { name: "Покупатель увидит" });
    await expect(preview).toHaveText("Покупатель увидит · Пн–Сб · 10:00–13:00, 13:00–16:00 …");
    await common.getByRole("combobox", { name: "Длительность интервала" }).selectOption("1");
    await expect(preview).toHaveText("Покупатель увидит · Пн–Сб · 10:00–11:00, 11:00–12:00 …");
    await save.click();
    await expect(save).toBeHidden();
  });
  await test.step("§14.3 · старые окна показываются ближайшим вариантом без записи до сохранения", async () => {
    const count = writes.length;
    const legacy = {
      mode: "slots",
      days: { mon: [{ start: "09:00", end: "20:00" }] },
      preparationMinutes: 60,
      dayCutoff: "18:00",
    } as const;
    schedule = { timeZone, delivery: { ...legacy, days: { mon: [...legacy.days.mon] } } };
    revision = 0;
    await openHours();
    await expect(common.getByRole("combobox", { name: "Длительность интервала" })).toHaveValue("3");
    await expect(common.getByText("Сохранённые интервалы")).toHaveCount(0);
    expect(writes).toHaveLength(count);
    await save.click();
    await expect(save).toBeHidden();
    expect(writes.at(-1)).toMatchObject({
      expectedRevision: 0,
      delivery: { interval: "3", days: { mon: [{ start: "09:00", end: "20:00" }] } },
    });
  });
  await page.unroute(path);
}

async function checkHoursWidths(page: Page) {
  const heading = page.getByRole("heading", { name: "Когда принимаете заказы" });
  await expect(heading).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  for (const width of [360, 390, 412]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    const overflow = await page.getByRole("region", { name: "Когда принимаете заказы" }).evaluate((card) => {
      const edge = card.getBoundingClientRect();
      return (
        document.documentElement.scrollWidth > innerWidth ||
        [...card.querySelectorAll("button, select, output")].some((control) => {
          const box = control.getBoundingClientRect();
          return box.left < edge.left || box.right > edge.right;
        })
      );
    });
    expect(overflow, `${width}px`).toBe(false);
    expect(
      await page
        .getByRole("status", { name: "Покупатель увидит" })
        .evaluate((line) => line.scrollWidth <= line.clientWidth),
      `${width}px · первые два интервала в строке`,
    ).toBe(true);
    await page.screenshot({ path: `test-results/shop-hours-${width}.png`, fullPage: true, animations: "disabled" });
    await page.evaluate(() => window.scrollBy(0, 165));
    await expect
      .poll(() =>
        heading.evaluate((element) => {
          const header = document.querySelector("header");
          return header ? element.getBoundingClientRect().top - header.getBoundingClientRect().bottom : -1;
        }),
      )
      .toBeGreaterThanOrEqual(0);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
}
