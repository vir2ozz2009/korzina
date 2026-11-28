import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import worker, { RestoreShop, Shop } from "../../scripts/l2-drill/worker";

it("экспортирует оба независимых класса хранилища", () => {
  expect(Shop).toBeTypeOf("function");
  expect(RestoreShop).toBeTypeOf("function");
  expect(Shop).not.toBe(RestoreShop);
});

it("не запускает учебное восстановление в обычной среде", async () => {
  const request = new Request("https://training.invalid/", { method: "POST" });
  const response = await worker.fetch(request, { ...env, DRILL_TOKEN: "test-token" });
  expect(response.status).toBe(404);
});

it("не запускает учебное восстановление без правильного ключа", async () => {
  const request = new Request("https://training.invalid/", { method: "POST" });
  const training = { ...env, APP_ENV: "l2-drill" as Env["APP_ENV"], DRILL_TOKEN: "test-token" };
  expect((await worker.fetch(request, training)).status).toBe(404);
});
