import { beforeAll, expect, it } from "vitest";
import type { SellerOrderPage } from "../../../src/shared/contracts/seller-order";
import { getAuth, sellerFixture } from "../../testing/auth";
import { snapshot } from "../../testing/orders";
import { setupPlatform } from "../../testing/platform";
import { shopCatalogSql } from "../catalog/testing";

beforeAll(setupPlatform);

it("§13.2: короткий номер совпадает точно, четыре цифры также ищутся в телефоне", async () => {
  const shop = "korzina-demo-test2";
  const seller = await sellerFixture(shop);
  const order = JSON.stringify({ ...snapshot, phone: "+7 (912) 345-67-89", customerNameKey: "мария" });
  await shopCatalogSql(
    `INSERT INTO orders(number,customer,created_at,status,payment_status,snapshot) VALUES
      (9,'guest:short-order',0,'placed','unpaid',json_remove(?,'$.phone','$.customerNameKey')),
      (19,'guest:other-order',0,'placed','unpaid',?),
      (9123,'guest:long-order',0,'placed','unpaid',json_remove(?,'$.phone','$.customerNameKey')),
      (19123,'guest:other-long-order',0,'placed','unpaid',json_remove(?,'$.phone','$.customerNameKey'))`,
    [order, order, order, order],
    shop,
  );
  for (const [search, numbers] of [
    ["9", [9]],
    ["№ 9", [9]],
    ["9123", [19, 9123]],
    ["№9123", [19, 9123]],
    ["МАРИЯ", [19]],
    ["+7 (912) 3", [19]],
  ] as const) {
    const response = await getAuth(
      `/api/seller/orders?store=test2&search=${encodeURIComponent(search)}`,
      seller.headers,
    );
    expect(response.ok).toBe(true);
    const result = await response.json<SellerOrderPage>();
    expect(result.orders.map((row) => row.number)).toEqual(numbers);
    expect(result.counts.placed).toBe(numbers.length);
  }
});
