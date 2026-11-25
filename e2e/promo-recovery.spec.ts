import { expect, test } from "@playwright/test";
import { checkPromoReportRevocation } from "./promo-report-revocation";

test("12.1 §1 · M4: промокод закрывает шторку Mini App даже без завершения анимации", async ({ page }) => {
  await page.addInitScript(() => {
    const noop = () => {};
    window.Telegram = {
      WebApp: {
        initData: "promo-mini-app-fixture",
        viewportHeight: 740,
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
  });
  await page.route(/\/api\/auth\/(guest|telegram)(?:\?|$)/, (route) => route.fulfill({ json: { kind: "telegram" } }));
  const commands: string[] = [];
  let code = false;
  let quantity = 1;
  let revision = 0;
  const totalMinor = () => quantity * 55_000 - (code ? 11_000 : 0);
  await page.route(/\/api\/checkout\/summary(?:\?|$)/, (route) =>
    route.fulfill({ json: { currency: "VND", deliveryMinor: 0, totalMinor: totalMinor() } }),
  );
  await page.route(/\/api\/cart(?:\?|$)/, async (route) => {
    if (route.request().method() === "POST") {
      const input = route.request().postDataJSON();
      revision++;
      if (input.promoAction) {
        commands.push(input.promoAction);
        code = input.promoAction === "apply";
      } else quantity = input.quantity;
    }
    await route.fulfill({
      json: {
        revision,
        currency: "VND",
        count: quantity,
        lines: [
          {
            variantId: "fixture",
            productId: "fixture",
            name: "Учебный товар",
            unit: "шт.",
            quantity,
            priceMinor: 55_000,
            stock: 10,
            available: true,
          },
        ],
        itemsMinor: quantity * 55_000,
        totalMinor: totalMinor(),
        adjustments: code ? [{ kind: "code", sourceId: "fixture", label: "Учебная скидка", amount: -11_000 }] : [],
        promo: code ? { code: "M4TEST", reason: "applied" } : {},
      },
    });
  });
  await page.goto("/cart?shop=test2");
  await page.addStyleTag({
    content:
      '[data-vaul-drawer][data-state="closed"],[data-vaul-overlay][data-state="closed"]{animation-play-state:paused!important}',
  });
  const open = page.getByRole("button", { name: "Промокод", exact: true });
  const applied = page.getByRole("button", { name: "M4TEST" });
  const dialog = page.getByRole("dialog");
  await open.click();
  await dialog.getByRole("textbox", { name: "Промокод" }).fill("M4TEST");
  await dialog.getByRole("button", { name: "Применить" }).click();
  await expect(page.locator("[data-vaul-overlay]")).toHaveCount(0);
  await expect(dialog).toHaveCount(0);
  await expect(applied).toBeFocused();
  await expect(page.getByText("Учебная скидка")).toBeVisible();
  const total = page.getByText("Итого", { exact: true }).locator("..");
  await expect(total).toContainText(/44\D000/);
  await page.screenshot({ path: "test-results/promo-M4-mini-app-390.png", animations: "disabled" });
  const plus = page.getByRole("button", { name: "Увеличить количество" });
  const minus = page.getByRole("button", { name: "Уменьшить количество" });
  await plus.click();
  await expect(total).toContainText(/99\D000/);
  await minus.click();
  await expect(total).toContainText(/44\D000/);
  await applied.click();
  await dialog.getByRole("button", { name: "Убрать" }).click();
  await expect(page.locator("[data-vaul-overlay]")).toHaveCount(0);
  await expect(dialog).toHaveCount(0);
  await expect(open).toBeFocused();
  await expect(page.getByText("Учебная скидка")).toHaveCount(0);
  await expect(total).toContainText(/55\D000/);
  await plus.click();
  await expect(total).toContainText(/110\D000/);
  expect(commands).toEqual(["apply", "remove"]);
});

test("12.1 §11 · K4c: отзыв права закрывает открытый отчёт и детализацию", ({ page }) =>
  checkPromoReportRevocation(page));
