import { expect, it } from "vitest";
import type { ShopContext } from "../src/shared/contracts/shop-context";
import { themedHtml } from "./html";

it("HTML изолирует тему витрины от кабинета, не кеширует bootstrap и экранирует данные магазина", async () => {
  const context: ShopContext = {
    id: "a",
    slug: "a",
    name: "</script><script>alert(1)</script>",
    status: "active",
    plan: "base",
    createdAt: 0,
    features: { cashback: false },
    theme: { preset: "herb" },
  };
  const shell = () =>
    new Response("<!doctype html><html><head></head><body></body></html>", {
      headers: { "Content-Type": "text/html", ETag: "shell" },
    });
  const storefront = themedHtml(shell(), context, true);
  expect(storefront.headers.get("Cache-Control")).toBe("no-store");
  expect(storefront.headers.has("ETag")).toBe(false);
  const html = await storefront.text();
  expect(html).toContain("--primary:#1f9254");
  expect(html).not.toContain(context.name);
  expect(html.match(/<script/g)).toHaveLength(1);
  expect(await themedHtml(shell(), context, false).text()).toContain("--primary:#ff335f");
});
