import { env } from "cloudflare:workers";
import { beforeAll, beforeEach } from "vitest";
import type { Cart } from "../../../src/shared/contracts/cart";
import type { PromoTerms } from "../../../src/shared/contracts/promo";
import { getAuth, postAuth } from "../../testing/auth";
import { setupPlatform } from "../../testing/platform";
import { catalogSql } from "../catalog/testing";
import { setupCheckout } from "../checkout/testing";

export const shop = "korzina-demo-lavka";
export const terms: PromoTerms = {
  name: "Тестовая скидка",
  kind: "code",
  code: "HOT",
  discount: { type: "fixed", value: 7500 },
  scope: { type: "all" },
  confirmed: false,
  totalLimit: 1,
};
beforeAll(setupPlatform);
beforeEach(async () => {
  await setupCheckout();
  await catalogSql("DELETE FROM promo_uses");
  await catalogSql("DELETE FROM promo_offers");
  await catalogSql("UPDATE variants SET stock=25,price_minor=49000,old_price_minor=NULL WHERE id='sku-01'");
  await env.PLATFORM.prepare("INSERT OR REPLACE INTO feature_overrides(shop_id,key,enabled) VALUES(?,'promotions',1)")
    .bind(shop)
    .run();
});
export const seller = (headers: HeadersInit, body: object, suffix = "", key = crypto.randomUUID(), store = "lavka") =>
  postAuth(`/api/seller/promotions${suffix}?store=${store}`, body, { ...headers, "Idempotency-Key": key });
export const readCart = async (Cookie: string) => (await getAuth("/api/cart?shop=lavka", { Cookie })).json<Cart>();
