import { env } from "cloudflare:workers";
import { beforeAll, expect, it } from "vitest";
import { setupPlatform } from "../testing/platform";
import { resolveShop } from "./resolve-shop";

beforeAll(setupPlatform);
it("preview не использует снимок магазина из кеша demo", async () => {
  const request = new Request("https://demo.korzina.app/?shop=test2");
  const demo = await resolveShop(request, env.PLATFORM, "demo");
  await env.PLATFORM.prepare("UPDATE shops SET name = ? WHERE slug = ?").bind("Preview shop", "test2").run();
  expect((await resolveShop(request, env.PLATFORM, "preview"))?.name).toBe("Preview shop");
  expect((await resolveShop(request, env.PLATFORM, "demo"))?.name).toBe(demo?.name);
});
