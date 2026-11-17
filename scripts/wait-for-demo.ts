import { setTimeout } from "node:timers/promises";

const expected = process.env.GITHUB_SHA;
if (!expected) throw new Error("Нужен GITHUB_SHA для проверки опубликованной версии");
for (let attempt = 0; ; attempt++) {
  try {
    const response = await fetch("https://demo.korzina.app/?shop=test2", {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const html = await response.text();
    if (response.ok && html.includes(`name="build-revision" content="${expected}"`)) {
      console.log(`Demo revision ready: ${expected}`);
      break;
    }
  } catch (error) {
    console.log(error instanceof Error ? error.message : "Demo ещё недоступно");
  }
  if (attempt >= 35) throw new Error(`Demo не опубликовало ${expected} за 3 минуты`);
  await setTimeout(5000);
}
