import type { ProductImageSource } from "../../ui/product-image";

const seedSet = (display: "photo" | "cutout") =>
  [160, 400, 800, 1200].map((width) => `/seed/tomato-${display}-${width}.webp ${width}w`).join(", ");
export const tomatoPhoto: ProductImageSource = {
  src: "/seed/tomato-photo-400.webp",
  srcSet: seedSet("photo"),
  display: "photo",
  original: { src: "/seed/tomato-original.png", srcSet: "/seed/tomato-original.png 1200w" },
};
export const tomatoCutout: ProductImageSource = {
  src: "/seed/tomato-cutout-400.webp",
  srcSet: seedSet("cutout"),
  display: "cutout",
  original: tomatoPhoto.original,
};
export const photoModes = [
  { mode: "photo", label: "Фото", image: tomatoPhoto },
  { mode: "cutout", label: "Без фона", image: tomatoCutout },
];
export const demoProduct = {
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
