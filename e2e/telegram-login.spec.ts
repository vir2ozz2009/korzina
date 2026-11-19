import { expect, test } from "@playwright/test";

for (const role of ["buyer", "seller"] as const) {
  test(`BL-3/BL-5: ${role} resumes Telegram login and closes the prompt`, async ({ page, context }) => {
    const seller = role === "seller";
    const routePath = seller ? "/seller?shop=test2" : "/profile?shop=test2";
    const authPath = seller ? "/api/seller/cabinet" : "/api/auth/telegram";
    const exchange = `${seller ? "seller" : "purchase"}_${"a".repeat(48)}`;
    const telegram = `https://t.me/KorzinaFixtureBot?start=${exchange}`;
    let confirmed = false;
    let signedIn = false;
    let completions = 0;
    let openedTabs = 0;
    context.on("page", () => openedTabs++);

    // Represent Telegram's HTTPS fallback without contacting the bot or writing to demo data.
    await context.route(telegram, (route) => route.fulfill({ contentType: "text/html", body: "Telegram" }));
    await context.route(new RegExp(`${authPath}/start(?:\\?|$)`), (route) => {
      expect(route.request().postDataJSON()).toEqual({ returnPath: routePath });
      return route.fulfill({ json: { exchange, expiresAt: Date.now() + 60_000, url: telegram } });
    });
    await context.route(new RegExp(`${authPath}/finish(?:\\?|$)`), (route) => {
      expect(route.request().postDataJSON()).toEqual({ exchange });
      if (confirmed) completions++;
      signedIn = confirmed;
      return route.fulfill({ status: signedIn ? 200 : 202, json: { pending: !signedIn } });
    });
    if (seller) {
      const shop = { slug: "test2", name: "Магазин BL-3", status: "active" };
      await context.route(/\/api\/seller\/cabinet(?:\?|$)/, (route) =>
        signedIn ? route.fulfill({ json: { telegramId: "100", current: shop, shops: [shop] } }) : route.fallback(),
      );
    } else {
      await context.route(/\/api\/auth\/contact(?:\?|$)/, (route) =>
        route.fulfill({ json: { phone: null, region: "VN", telegramLinked: signedIn } }),
      );
      await context.route(/\/api\/profile(?:\?|$)/, (route) =>
        route.fulfill({ json: { name: "Покупатель BL-3", telegramLinked: true, platformAdmin: false } }),
      );
    }

    await page.goto(routePath);
    if (!seller) await page.getByRole("button", { name: "Войти", exact: true }).click();
    await page.getByRole("button", { name: "Войти через Telegram" }).click();
    const open = page.getByRole(seller ? "button" : "link", { name: "Открыть Telegram" });
    await expect(open).toBeVisible();
    await page.screenshot({ path: `test-results/telegram-login-${role}-390.png`, animations: "disabled" });
    await open.click();
    await expect(page).toHaveURL(telegram);
    await page.goBack();
    await page.reload();
    expect(new URL(page.url()).pathname).toBe(seller ? "/seller" : "/profile");
    await expect(open).toBeVisible();
    expect(openedTabs).toBe(0);

    // Exercise the seller's original tab and the buyer's bot link in a separate tab of the same browser.
    const returned = seller ? page : await context.newPage();
    if (!seller) await returned.goto(`${routePath}#telegram-return`);
    const resumedLink = returned.getByRole(seller ? "button" : "link", { name: "Открыть Telegram" });
    await expect(resumedLink).toBeVisible();
    confirmed = true;
    await returned.evaluate(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
    });
    const signedInName = returned
      .locator("#screen-content")
      .getByRole("heading", { level: 2, name: seller ? "Магазин BL-3" : "Покупатель BL-3" });
    await expect(signedInName).toBeVisible({ timeout: 12_000 });
    await expect(returned.getByRole("status").filter({ hasText: "Вы вошли через Telegram" })).toBeVisible();
    await expect(returned.getByRole("dialog")).toHaveCount(0);
    expect(completions).toBe(1);
    await returned.reload();
    await expect(signedInName).toBeVisible();
    await expect(resumedLink).toHaveCount(0);
  });
}

test("BL-5: Mini App signs in with initData without opening the login sheet", async ({ page }) => {
  await page.addInitScript(() => {
    const noop = () => {};
    window.Telegram = {
      WebApp: {
        initData: "telegram-init-data-fixture",
        viewportHeight: 844,
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
  let signedIn = false;
  await page.route(/\/api\/auth\/telegram(?:\?|$)/, (route) => {
    expect(route.request().postDataJSON()).toEqual({ initData: "telegram-init-data-fixture" });
    signedIn = true;
    return route.fulfill({ json: { kind: "telegram" } });
  });
  await page.route(/\/api\/auth\/contact(?:\?|$)/, (route) =>
    route.fulfill({ json: { phone: null, region: "VN", telegramLinked: signedIn } }),
  );
  await page.route(/\/api\/profile(?:\?|$)/, (route) =>
    route.fulfill({ json: { name: "Покупатель Mini App", telegramLinked: true, platformAdmin: false } }),
  );
  await page.goto("/profile?shop=test2");
  await expect(page.getByRole("heading", { name: "Покупатель Mini App" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
