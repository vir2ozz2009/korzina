import { expect, type Page, test } from "@playwright/test";
import { cabinetFixture } from "./workday-fixture";

export async function checkWorkdayShare(page: Page, baseURL: string | undefined) {
  await cabinetFixture(page, false);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: ({ url }: ShareData) => {
        document.body.dataset.sharedUrl = url;
        const error = document.body.dataset.shareError;
        return error ? Promise.reject(new DOMException("Web Share", error)) : Promise.resolve();
      },
    });
    const writeText = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = async (url) => {
      try {
        await writeText(url);
      } catch (error) {
        if (error instanceof DOMException) document.body.dataset.clipboardError = error.name;
        throw error;
      }
    };
  });
  await page.goto("/seller?store=test2");
  const share = page.getByRole("button", { name: "Поделиться", exact: true });
  const address = page.getByRole("textbox", { name: "Ссылка для ручного копирования" });
  const body = page.locator("body");
  const firstUrl = new URL("/?shop=test2", baseURL).href;
  const draftUrl = new URL("/?shop=workday-draft", baseURL).href;
  const copied = page.getByText("Ссылка скопирована", { exact: true });
  const selectDraft = async () => {
    await page.getByRole("button", { name: "Выбрать магазин" }).click();
    await page.getByRole("button", { name: /Черновик магазина/ }).click();
    await expect(page.getByText(draftUrl, { exact: true })).toBeVisible();
  };

  await test.step("Блок 9 · 05, §15.1: публичный адрес магазина и черновика", async () => {
    await expect(page.getByText(firstUrl, { exact: true })).toBeVisible();
    await share.click();
    await expect(body).toHaveAttribute("data-shared-url", firstUrl);
    await expect(copied).toHaveCount(0);
    await page.screenshot({ path: "test-results/workday-public-address-390.png", animations: "disabled" });
    await selectDraft();
  });

  await test.step("Блок 9 · 09, §15.1: SDK с пустым initData не мешает копированию", async () => {
    await setTelegramInitData(page, "");
    await page.evaluate(() => Object.defineProperty(navigator, "share", { value: undefined }));
    await share.click();
    await expect(copied).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(draftUrl);
    await expect(body).not.toHaveAttribute("data-telegram-share", /.+/);
    await page.screenshot({ path: "test-results/workday-share-empty-init-data-390.png", animations: "disabled" });
  });

  await test.step("Блок 9 · 06, §15.1: отказ, отмена и окно Telegram для витрины и приглашения", async () => {
    await page.goto("/seller?store=test2");
    await page.evaluate(() => {
      document.body.dataset.shareError = "AbortError";
    });
    await share.click();
    await expect(body).toHaveAttribute("data-shared-url", firstUrl);
    await expect(copied).toHaveCount(0);
    await expect(address).toHaveCount(0);
    await expect(page.getByText("Не удалось поделиться ссылкой")).toHaveCount(0);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(draftUrl);

    await page.evaluate(() => {
      document.body.dataset.shareError = "NotAllowedError";
    });
    await share.click();
    await expect(copied).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(firstUrl);

    // Let Chromium itself block clipboard writes, including writes during a click.
    await page.route("**/seller?store=test2", async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        headers: { ...response.headers(), "permissions-policy": "clipboard-write=()" },
      });
    });
    await page.goto("/seller?store=test2");
    await page.evaluate(() => {
      document.body.dataset.shareError = "NotAllowedError";
    });
    await share.click();
    await expect(body).toHaveAttribute("data-clipboard-error", "NotAllowedError");
    await expect(address).toHaveValue(firstUrl);
    expect(await address.evaluate((input: HTMLInputElement) => input.readOnly)).toBe(true);
    await address.focus();
    expect(await address.evaluate((input: HTMLInputElement) => input.selectionEnd)).toBe(firstUrl.length);
    await page.screenshot({ path: "test-results/workday-share-manual-390.png", animations: "disabled" });
    await selectDraft();
    await expect(address).toHaveCount(0);

    const invite = {
      id: "workday-invite",
      role: "picker",
      expiresAt: Date.now() + 86_400_000,
      state: "pending",
      url: "https://t.me/KorzinaDemoBot?start=invite_link",
    };
    await page.route("**/seller/team?store=test2", async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, headers: { ...response.headers(), "permissions-policy": "clipboard-write=()" } });
    });
    await page.route(/\/api\/seller\/team\/members\?/, (route) => route.fulfill({ json: { members: [] } }));
    await page.route(/\/api\/seller\/team\/invites\?/, (route) =>
      route.fulfill({ json: route.request().method() === "POST" ? invite : { invites: [] } }),
    );
    await page.goto("/seller/team?store=test2");
    await page.getByRole("button", { name: "Добавить сотрудника" }).click();
    await page.getByRole("button", { name: "Создать приглашение" }).click();
    await expect(page.getByText(invite.url, { exact: true })).toBeVisible();
    await page.evaluate(() => {
      document.body.dataset.shareError = "NotAllowedError";
    });
    await share.click();
    await expect(body).toHaveAttribute("data-clipboard-error", "NotAllowedError");
    await expect(address).toHaveValue(invite.url);

    await setTelegramInitData(page, "hash=fixture");
    await share.click();
    await expect(body).toHaveAttribute("data-telegram-share", telegramShareUrl(invite.url));
    await page.getByRole("dialog", { name: "Приглашение" }).getByRole("button", { name: "Закрыть" }).click();
    await page.getByRole("navigation", { name: "Кабинет продавца" }).getByRole("button", { name: "Главная" }).click();
    await share.click();
    await expect(body).toHaveAttribute("data-telegram-share", telegramShareUrl(firstUrl));
  });
}

async function setTelegramInitData(page: Page, initData: string) {
  await page.evaluate((initData) => {
    window.Telegram = {
      // Only the Telegram SDK boundary is simulated. A native Telegram client is outside Playwright.
      WebApp: {
        initData,
        openTelegramLink: (url: string) => {
          document.body.dataset.telegramShare = url;
        },
      } as NonNullable<NonNullable<Window["Telegram"]>["WebApp"]>,
    };
  }, initData);
}

function telegramShareUrl(url: string) {
  return `https://t.me/share/url?url=${encodeURIComponent(url).replace(/%20/g, "+")}`;
}
