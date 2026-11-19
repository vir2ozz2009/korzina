import { expect, it } from "vitest";
import { storefrontProducts } from "../../shared/catalog/model";
import type { CatalogOffer, CatalogTile } from "../../shared/contracts/catalog";

it("плитка использует только оперативные предложения: скрытые, удалённые и чужие SKU из старого документа исчезают", () => {
  const product: CatalogTile = {
    id: "p",
    name: "Товар",
    categoryId: "c",
    brandId: null,
    image: null,
    variants: ["valid", "sold", "hidden", "deleted", "other"].map((id) => ({ id, name: id, photoId: null })),
  };
  const offer: CatalogOffer = {
    id: "valid",
    productId: "p",
    priceMinor: 12345,
    oldPriceMinor: null,
    stock: 2,
    available: true,
    visible: true,
  };
  const products = storefrontProducts(
    [product],
    [
      offer,
      { ...offer, id: "sold", stock: 0, available: false },
      { ...offer, id: "hidden", visible: false },
      { ...offer, id: "other", productId: "other-product" },
    ],
  );
  expect(products[0].variants.map((v) => v.id)).toEqual(["valid", "sold"]);
  expect(products[0].variants[0]).toMatchObject({ priceMinor: 12345, stock: 2 });
  expect(storefrontProducts([product], [])).toEqual([]);
});
