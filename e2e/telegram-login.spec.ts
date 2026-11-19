import { expect, test } from "@playwright/test";

for (const role of ["buyer", "seller"] as const) {
  test(`BL-3: ${role} resumes Telegram login in the original tab`, async ({ page, context }) => {
    const seller = role === "seller";
    const routePath = seller ? "/seller?shop=test2" : "/profile?shop=test2";
    const authPath = seller ? "/api/seller/cabinet" : "/api/auth/telegram";
    const exchange = `${seller ? "seller" : "purchase"}_${"a".repeat(48)}`;
    const telegram = `https://t.me/KorzinaFixtureBot?start=${exchange}`;
    let confirmed = false;
    let signedIn = false;
    let openedTabs = 0;
    context.on("page", () => openedTabs++);

    // Represent Telegram's HTTPS fallback without contacting the bot or writing to demo data.
    await context.route(telegram, (route) => route.fulfill({ contentType: "text/html", body: "Telegram" }));
    await context.route(new RegExp(`${authPath}/start(?:\\?|$)`), (route) =>
      route.fulfill({ json: { exchange, expiresAt: Date.now() + 60_000, url: telegram } }),
    );
    await context.route(new RegExp(`${authPath}/finish(?:\\?|$)`), (route) => {
      expect(route.request().postDataJSON()).toEqual({ exchange });
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

    confirmed = true;
    const signedInName = page
      .locator("#screen-content")
      .getByRole("heading", { level: 2, name: seller ? "Магазин BL-3" : "Покупатель BL-3" });
    await expect(signedInName).toBeVisible({ timeout: 12_000 });
    await page.reload();
    await expect(signedInName).toBeVisible();
    await expect(open).toHaveCount(0);
    expect(openedTabs).toBe(0);
  });
}
