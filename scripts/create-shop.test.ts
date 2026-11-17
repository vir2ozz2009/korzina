import { describe, expect, it } from "vitest";
import { prepareShop } from "../server/platform/create-shop";

describe("параметры нового магазина", () => {
  it.each(["", "-shop", "shop-", "SHOP", "shop.other", "../shop", "a".repeat(64), "demo", "admin"])(
    "отклоняет slug %s",
    async (slug) => {
      await expect(prepareShop(slug, "Название")).rejects.toThrow();
    },
  );
  it.each(["", "   ", "а".repeat(121)])("отклоняет неверное название", async (name) => {
    await expect(prepareShop("valid", name)).rejects.toThrow();
  });
  it("выдаёт разные токены и правильную ссылку для local", async () => {
    const a = await prepareShop("valid", " Название ", "http://localhost:5173");
    const b = await prepareShop("valid", "Название");
    expect(a.shop.name).toBe("Название");
    expect(a.storefront).toBe("http://localhost:5173/?shop=valid");
    expect(b.storefront).toBe("https://demo.korzina.app/?shop=valid");
    expect(a.invitation).not.toBe(b.invitation);
    expect(a.expiresAt - a.shop.createdAt).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
