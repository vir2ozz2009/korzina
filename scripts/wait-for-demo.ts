import { setTimeout } from "node:timers/promises";
import { publishedAssetsReady } from "./published-assets.ts";

const expected = process.env.GITHUB_SHA;
if (!expected) throw new Error("Нужен GITHUB_SHA для проверки опубликованной версии");
const documentUrl = "https://demo.korzina.app/?shop=test2";
for (let attempt = 0; ; attempt++) {
  try {
    const response = await fetch(documentUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const html = await response.text();
    if (
      response.ok &&
      html.includes(`name="build-revision" content="${expected}"`) &&
      (await publishedAssetsReady(documentUrl, html))
    ) {
      const search = await fetch("https://demo.korzina.app/api/catalog/search?shop=test2&q=молко", {
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      await search.body?.cancel();
      if (search.ok) {
        console.log(`Demo revision ready: ${expected}`);
        break;
      }
      console.log(`Demo search still starting: HTTP ${search.status}`);
    }
  } catch (error) {
    console.log(error instanceof Error ? error.message : "Demo ещё недоступно");
  }
  if (attempt >= 35) throw new Error(`Demo не опубликовало ${expected} за 3 минуты`);
  await setTimeout(5000);
}
