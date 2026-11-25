import { expect, type Page, test } from "@playwright/test";

const cartApi = /\/api\/cart(?:\?|$)/;
const pickup = { address: "Учебный самовывоз", hours: "09:00–20:00" };
const availability = { available: true, mode: "pickup", pickup };
const codeButton = (page: Page, name: string) => page.getByRole("button", { name, exact: true });

async function buyer(page: Page, initial: string) {
  let code = initial;
  let revision = 1;
  const totals = { WELL15: 85_000, SECOND: 80_000 } as Record<string, number>;
  const totalMinor = () => totals[code] ?? 100_000;
  await page.route(/\/api\/auth\/(guest|telegram|contact)(?:\?|$)/, (route) =>
    route.fulfill({ json: { kind: "telegram", telegramLinked: true } }),
  );
  await page.route(/\/api\/checkout\/summary(?:\?|$)/, (route) =>
    route.fulfill({
      json: {
        currency: "VND",
        acceptingOrders: true,
        shortMinor: 0,
        deliveryMinor: 0,
        totalMinor: totalMinor(),
        availability,
      },
    }),
  );
  await page.route(/\/api\/receiving(?:\?|$)/, (route) =>
    route.fulfill({ json: { revision, pickup, receiving: { mode: "pickup" }, acceptingOrders: true, availability } }),
  );
  const commands: string[] = [];
  await page.route(cartApi, async (route) => {
    let alternative: object | undefined;
    if (route.request().method() === "POST") {
      const input = route.request().postDataJSON();
      commands.push(`${input.promoAction}:${input.code}`);
      if (!totals[input.code]) {
        return route.fulfill({
          status: 400,
          json: {
            error: { code: "VALIDATION", message: "Промокод не применён", details: { promo: { reason: "unknown" } } },
          },
        });
      }
      if (input.promoAction === "compare")
        alternative = { code: input.code, reason: "applied", totalMinor: totals[input.code] };
      else {
        code = input.code;
        revision++;
      }
    }
    return route.fulfill({
      json: {
        revision,
        currency: "VND",
        count: 2,
        lines: [
          {
            variantId: "fixture",
            productId: "fixture",
            name: "Учебный товар",
            unit: "шт.",
            quantity: 2,
            priceMinor: 50_000,
            stock: 10,
            available: true,
          },
        ],
        itemsMinor: totalMinor(),
        totalMinor: totalMinor(),
        adjustments: [],
        promo: { ...(code && { code, reason: "applied" }), alternative },
      },
    });
  });
  return { commands };
}

test("12.1 · неизвестный код нельзя подтвердить, после ошибки доступны отказ и замена", async ({ page }) => {
  const { commands } = await buyer(page, "WELL15");
  await page.goto("/cart?shop=test2");
  const dialog = page.getByRole("dialog");
  const input = dialog.getByRole("textbox", { name: "Промокод" });
  const apply = dialog.getByRole("button", { name: "Применить" });
  const openReplacement = async (code: string) => {
    await codeButton(page, "WELL15").click();
    await dialog.getByRole("button", { name: "Заменить", exact: true }).click();
    await input.fill(code);
    await apply.click();
  };
  await openReplacement("UNKNOWN");
  await expect(dialog.getByText("Код не найден")).toBeVisible();
  await expect(apply).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Заменить код" })).toHaveCount(0);
  await input.press("Enter");
  expect(commands).toEqual(["compare:UNKNOWN"]);
  await input.fill("SECOND");
  await input.press("Enter");
  await expect(dialog.getByText(/WELL15 · 85\D000/)).toBeVisible();
  await expect(dialog.getByText(/SECOND · 80\D000/)).toBeVisible();
  await dialog.getByRole("button", { name: "Оставить прежний" }).click();
  await expect(codeButton(page, "WELL15")).toBeVisible();
  await openReplacement("SECOND");
  await dialog.getByRole("button", { name: "Заменить код" }).click();
  await expect(codeButton(page, "SECOND")).toBeVisible();
  expect(commands).toEqual(["compare:UNKNOWN", "compare:SECOND", "compare:SECOND", "apply:SECOND"]);
});

test("12.1 · неизвестный первый код не меняет корзину", async ({ page }) => {
  const { commands } = await buyer(page, "");
  await page.goto("/cart?shop=test2");
  await codeButton(page, "Промокод").click();
  const dialog = page.getByRole("dialog");
  const input = dialog.getByRole("textbox", { name: "Промокод" });
  await input.fill("UNKNOWN");
  await input.press("Enter");
  await expect(dialog.getByText("Код не найден")).toBeVisible();
  await input.press("Enter");
  await dialog.getByRole("button", { name: "Закрыть" }).click();
  await expect(codeButton(page, "Промокод")).toBeVisible();
  expect(commands).toEqual(["apply:UNKNOWN"]);
});

for (const source of ["Telegram", "экран"] as const) {
  test(`12.1 · стрелка «${source}» возвращает из «Получения» в ту же корзину`, async ({ page }) => {
    await buyer(page, "WELL15");
    if (source === "Telegram")
      await page.addInitScript(() => {
        const handlers = new Set<() => void>();
        const trace = {
          attached: 0,
          detached: 0,
          calls: 0,
          get active() {
            return handlers.size;
          },
          click() {
            for (const handler of [...handlers]) {
              trace.calls++;
              handler();
            }
          },
        };
        Object.assign(window, { backTrace: trace });
        const nop = () => {};
        window.Telegram = {
          WebApp: {
            initData: "fixture",
            platform: "ios",
            viewportHeight: 740,
            isExpanded: true,
            colorScheme: "light",
            BackButton: {
              show: nop,
              hide: nop,
              onClick(fn) {
                trace.attached++;
                handlers.add(fn);
              },
              offClick(fn) {
                trace.detached++;
                handlers.delete(fn);
              },
            },
            ready: nop,
            expand: nop,
            setHeaderColor: nop,
            setBackgroundColor: nop,
            onEvent: nop,
            offEvent: nop,
          },
        };
      });
    await page.goto("/cart?shop=test2");
    for (let i = 0; i < 2; i++) {
      const before = await page.evaluate(() => history.state.__TSR_index as number);
      await page.getByRole("button", { name: /Продолжить/ }).click();
      await expect(page.getByRole("heading", { name: "Получение" })).toBeVisible();
      expect(await page.evaluate(() => history.state.__TSR_index)).toBe(before + 1);
      if (source === "Telegram") {
        const trace = await page.evaluate(() => {
          const trace = (
            window as unknown as {
              backTrace: { active: number; attached: number; detached: number; calls: number; click(): void };
            }
          ).backTrace;
          trace.click();
          return { active: trace.active, attached: trace.attached, detached: trace.detached, calls: trace.calls };
        });
        expect(trace.active).toBe(1);
        expect(trace.attached - trace.detached).toBe(1);
        expect(trace.calls).toBe(i + 1);
      } else await page.getByRole("button", { name: "Назад", exact: true }).click();
      await expect(page).toHaveURL(/\/cart\?shop=test2$/);
      expect(await page.evaluate(() => history.state.__TSR_index)).toBe(before);
      await expect(codeButton(page, "WELL15")).toBeVisible();
      await expect(page.getByText("Учебный самовывоз", { exact: false }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Уменьшить количество" }).locator("..")).toContainText("2");
    }
  });
}
