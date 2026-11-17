import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { isDemoPath, isDevelopmentHost } from "./development";
import { serveHtml } from "./html";
import { app } from "./index";

it("превью не позволяет разрешать магазин по slug на чужом домене", () => {
  expect(isDevelopmentHost("task-f10-ci-korzina-demo.vir2ozz2009.workers.dev")).toBe(true);
  for (const host of [
    "shop.korzina.app",
    "korzina.app",
    "other.vir2ozz2009.workers.dev",
    "f10-korzina-demo.attacker.workers.dev",
    "f10-korzina-demo.vir2ozz2009.workers.dev.evil.com",
  ]) {
    expect(isDevelopmentHost(host)).toBe(false);
  }
});

it("prod закрывает все служебные пути и демо-карточки, включая прямые ссылки", () => {
  for (const path of [
    "/dev",
    "/dev/kit",
    "/dev/media",
    "/dev/templates/home",
    "/p/demo",
    "/p/demo/details",
    "/seller/orders/demo",
  ]) {
    expect(isDemoPath(path)).toBe(true);
  }
  for (const path of ["/", "/p/tomato", "/seller/orders/123"]) expect(isDemoPath(path)).toBe(false);
});

it("prod возвращает 404 до обращения к Assets и БД, в том числе на demo-хосте", async () => {
  const production: Env = { ...env, APP_ENV: "production" };
  for (const path of ["/dev/kit", "/dev/media", "/dev/templates/home", "/p/demo/details"]) {
    expect((await serveHtml(new Request(`https://demo.korzina.app${path}`), production)).status).toBe(404);
  }
  const response = await app.request("https://demo.korzina.app/api/diagnostics/echo", { method: "POST" }, production);
  expect(response.status).toBe(404);
});
