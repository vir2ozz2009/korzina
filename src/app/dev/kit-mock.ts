import demoImages from "../../shared/demo-images.json";
import type { ProductImageSource } from "../../ui/product-image";

export const tomatoPhoto: ProductImageSource = demoImages["demo-curd"];
export const croissantPhoto: ProductImageSource = demoImages["demo-croissant"];
export const milkPhoto: ProductImageSource = demoImages["demo-milk"];
export const berryPhoto: ProductImageSource = demoImages["demo-berry"];
export const demoProduct = {
  currency: "RUB",
  name: "Томаты на ветке",
  unit: "500 г",
  amountMinor: 18900,
  oldMinor: 23900,
  image: tomatoPhoto,
};
export const demoTotals = [
  { label: "Товары", amountMinor: 18900 },
  { label: "Доставка", amountMinor: 5000 },
];
export const demoOptions = [
  { value: "delivery", label: "Доставка" },
  { value: "pickup", label: "Самовывоз" },
  { value: "courier", label: "Курьером · недоступно", disabled: true },
];
