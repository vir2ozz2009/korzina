import { env, exports } from "cloudflare:workers";
import { beforeAll, expect, it } from "vitest";
import { requestDemoSeed } from "../../platform/seed";
import { setupPlatformDatabase } from "../../testing/platform";

beforeAll(setupPlatformDatabase);

it("первый прямой запрос каталога ожидает заполнение учебного магазина", async () => {
  const seed = requestDemoSeed("korzina-demo-test2");
  await env.PLATFORM.prepare(seed.sql)
    .bind(...seed.params)
    .run();
  const response = await exports.default.fetch(new Request("http://127.0.0.1/api/catalog/document?shop=test2"));
  expect(response.status).toBe(200);
  const document = await response.json<{ categories: { id: string; hasProducts: boolean }[] }>();
  expect(document.categories).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: "home", hasProducts: true })]),
  );
});
