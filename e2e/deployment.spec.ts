import { expect, test } from "@playwright/test";
import { checkContent } from "./content";

// Release probe: full behaviour is checked on preview, this checks the published assets and navigation.
test("CI-FAST: опубликованная сборка → каталог → товар → назад", async ({ page, request }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (new URL(response.url()).pathname.startsWith("/api/") && response.status() >= 400)
      errors.push(`API ${response.status()}: ${response.url()}`);
  });
  const assertRevision = async () => {
    const sha = process.env.PR_HEAD_SHA || process.env.GITHUB_SHA;
    if (!sha || process.env.CI_BROWSER_REPORT !== "1" || !process.env.E2E_BASE_URL) return;
    const response = await request.get("/?shop=test2", { headers: { "Cache-Control": "no-cache" } });
    expect(response.ok()).toBe(true);
    expect(await response.text()).toContain(`name="build-revision" content="${sha}"`);
  };
  await assertRevision();
  await page.goto("/?shop=test2");
  await page.locator("article").first().waitFor();
  await checkContent(page, "home");
  await page.locator('a[href^="/p/"]').first().click();
  await checkContent(page, "product");
  await page.goBack();
  await expect(page.locator("article").first()).toBeVisible();
  expect(errors).toEqual([]);
  await assertRevision();
});
