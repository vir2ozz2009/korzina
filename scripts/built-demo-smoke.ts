import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout } from "node:timers/promises";
import { chromium } from "@playwright/test";

// Check the emitted demo, including its actual chunk graph, rather than Vite dev.
const baseURL = "http://127.0.0.1:4173";
const server = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", "4173", "--strictPort"],
  {
    stdio: "inherit",
  },
);
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`vite preview exited: ${server.exitCode}`);
    try {
      ready = (await fetch(`${baseURL}/api/health`)).ok;
    } catch {}
    if (ready) break;
    await setTimeout(100);
  }
  assert(ready, "Собранный demo не запустился");
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${baseURL}/?shop=test2`);
    await page.locator("#root > *").first().waitFor({ timeout: 10_000 });
    await page.locator("article").first().waitFor({ timeout: 10_000 });
    assert((await page.locator("#root").textContent())?.trim(), "#root пуст");
    assert.deepEqual(errors, [], "Ошибки выполнения demo-бандла");
    console.log("Built demo browser OK: root, products, no pageerror");
  } finally {
    await browser.close();
  }
} finally {
  server.kill("SIGTERM");
}
