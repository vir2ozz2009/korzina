import type { Browser, Page } from "@playwright/test";

export async function freshPage(browser: Browser, baseURL: string | undefined, run: (page: Page) => Promise<void>) {
  // Separate local browser clients should not share the runner's rate-limit bucket.
  // Cloudflare supplies the real client IP on deployed environments.
  const local = baseURL && new URL(baseURL).hostname === "127.0.0.1";
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
    ...(local ? { extraHTTPHeaders: { "CF-Connecting-IP": `e2e-${crypto.randomUUID()}` } } : {}),
  });
  try {
    await run(await context.newPage());
  } finally {
    await context.close();
  }
}
