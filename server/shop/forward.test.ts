import { beforeAll, expect, it } from "vitest";
import { resolveFeatures } from "../../src/shared/flags";
import { setupPlatform } from "../testing/platform";
import { forwardToShop } from "./forward";

beforeAll(setupPlatform);
it("общая пересылка передаёт флаги и перезаписывает поддельную идентичность запроса", async () => {
  const response = await forwardToShop(
    { req: { raw: new Request("https://internal/api/shop", { headers: { "x-korzina-shop": "forged" } }) } },
    {
      id: "korzina-demo-test2",
      slug: "test2",
      name: "Магазин",
      status: "active",
      plan: "base",
      createdAt: 0,
      features: resolveFeatures([{ key: "cashback", enabled: true }]),
    },
  );
  expect(response.ok).toBe(true);
  expect(await response.json()).toMatchObject({ id: "korzina-demo-test2", features: { cashback: true } });
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});
