import type { Browser, Page } from "@playwright/test";

export async function freshPage(browser: Browser, baseURL: string | undefined, run: (page: Page) => Promise<void>) {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  try {
    await run(await context.newPage());
  } finally {
    await context.close();
  }
}
