import { expect, it } from "vitest";
import { selectOffer } from "./offer";

it("плитка предлагает минимум только доступных фасовок; в корзине показывает цену, вес и лимит выбранного SKU", () => {
  const first = { id: "one", name: "250 г", priceMinor: 45000, oldPriceMinor: null, stock: 2, available: true };
  const second = { ...first, id: "two", name: "500 г", priceMinor: 79000, stock: 3 };
  const empty = { ...first, id: "empty", priceMinor: 100, stock: 0, available: false };
  expect(selectOffer([first, empty], [], "p")).toMatchObject({
    variant: first,
    multiple: false,
    from: false,
    unit: "250 г",
  });
  expect(selectOffer([first, second, empty], [], "p")).toMatchObject({
    variant: first,
    multiple: true,
    from: true,
    unit: "2 фасовки",
  });
  expect(selectOffer([first, { ...second, priceMinor: 45000 }], [], "p")).toMatchObject({
    multiple: true,
    from: false,
  });
  const selected = selectOffer(
    [first, second],
    [
      {
        variantId: "two",
        productId: "p",
        name: "Томаты",
        unit: "500 г",
        quantity: 1,
        priceMinor: 79000,
        stock: 3,
        available: true,
      },
    ],
    "p",
  );
  expect(selected).toMatchObject({ variant: second, multiple: false, from: false, unit: "500 г", quantity: 1 });
  const fresh = selectOffer(
    [first, second],
    [
      {
        variantId: "two",
        productId: "p",
        name: "Томаты",
        unit: "500 г",
        quantity: 1,
        priceMinor: 70000,
        stock: 1,
        available: true,
      },
    ],
    "p",
  );
  expect(fresh.variant).toMatchObject({ priceMinor: 70000, stock: 1 });
});
