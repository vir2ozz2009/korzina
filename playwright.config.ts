import { defineConfig } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:5173";
const regressions = process.env.E2E_REGRESSIONS === "1";
export default defineConfig({
  testDir: "./e2e",
  ...(regressions ? { testMatch: "regressions/*.spec.ts", timeout: 30_000 } : { testIgnore: "**/regressions/**" }),
  workers: 1,
  retries: 0,
  use: {
    baseURL,
    browserName: "chromium",
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH },
    viewport: { width: 390, height: 844 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev -- --mode e2e --port 5173 --strictPort",
        url: `${baseURL}/api/health`,
        reuseExistingServer: false,
        timeout: 60_000,
      },
});
