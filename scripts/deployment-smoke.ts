import assert from "node:assert/strict";

export async function deploymentSmoke(baseURL: string): Promise<void> {
  // A newly uploaded Version URL may take a few seconds to reach the edge.
  let lastError: unknown;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const health = await fetch(new URL("/api/health", baseURL), { signal: AbortSignal.timeout(10_000) });
      assert(health.ok, `health: HTTP ${health.status}`);
      assert.deepEqual(await health.json(), { ok: true });
      const url = new URL("/dev/kit?shop=test2", baseURL);
      const page = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      assert(page.ok, `UI-kit: HTTP ${page.status}`);
      const html = await page.text();
      const bootstrap = /<script id="shop-context" type="application\/json">([\s\S]*?)<\/script>/.exec(html)?.[1];
      assert(bootstrap, "HTML должен содержать bootstrap магазина");
      assert.equal(JSON.parse(bootstrap).slug, "test2");
      const module = /<script[^>]+type="module"[^>]+src="([^"]+)"/.exec(html)?.[1];
      assert(module, "HTML должен содержать JS приложения");
      const asset = await fetch(new URL(module, url), { signal: AbortSignal.timeout(10_000) });
      assert(asset.ok && /javascript/.test(asset.headers.get("content-type") ?? ""), "JS должен открываться");
      await asset.body?.cancel();
      console.log(`Deployment smoke OK: ${url.origin} (health, UI-kit, shop=test2, JS)`);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw lastError;
}

if (import.meta.main) await deploymentSmoke(process.argv[2] ?? "https://demo.korzina.app");
