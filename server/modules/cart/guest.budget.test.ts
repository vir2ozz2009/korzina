import { env } from "cloudflare:workers";
import { Hono } from "hono";
import { beforeAll, expect, it, vi } from "vitest";
import { customerCookie } from "../../auth/cookies";
import { app } from "../../index";
import { handleError } from "../../middleware/errors";
import * as forwarding from "../../shop/forward";
import { setupPlatform } from "../../testing/platform";
import { guestCart } from "./guest";

beforeAll(setupPlatform);
it("пустая гостевая корзина на холодном Worker не вызывает Shop ни за настройками, ни за корзиной", async () => {
  const forward = vi.spyOn(forwarding, "forwardToShop");
  try {
    for (const shop of ["test2", "lavka"]) {
      const response = await app.request(`https://demo.korzina.app/api/cart?shop=${shop}`, {}, env);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        revision: 0,
        currency: null,
        lines: [],
        count: 0,
        totalMinor: 0,
        adjustments: [],
      });
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(response.headers.has("Set-Cookie")).toBe(false);
    }
    expect(forward).not.toHaveBeenCalled();
  } finally {
    forward.mockRestore();
  }
});

it("cookie своего магазина и Bearer идут в проверку сессии; чужая cookie остаётся пустой корзиной", async () => {
  let forwarded = 0;
  const route = new Hono<{ Bindings: Env }>()
    .basePath("/api")
    .onError(handleError)
    .use("/cart", guestCart)
    .all("/cart", (c) => {
      forwarded++;
      return c.json({ checked: true });
    });
  const request = (headers: HeadersInit, method = "GET", shop = "test2") =>
    route.request(`https://demo.korzina.app/api/cart?shop=${shop}`, { headers, method }, env);
  expect(await (await request({ Cookie: `${customerCookie("korzina-demo-lavka")}=token` })).json()).toMatchObject({
    count: 0,
  });
  expect(forwarded).toBe(0);
  expect((await request({ Cookie: `${customerCookie("korzina-demo-test2")}=token` })).status).toBe(200);
  expect((await request({ Authorization: `Bearer ${"a".repeat(64)}` })).status).toBe(200);
  expect((await request({}, "POST")).status).toBe(200);
  expect(forwarded).toBe(3);
  expect((await request({ Authorization: "bad" })).status).toBe(401);
  expect((await request({}, "GET", "missing-shop-r1")).status).toBe(404);
  expect(forwarded).toBe(3);
});
