export const demoProduct = {
  name: "Томаты на ветке",
  unit: "500 г",
  amountMinor: 18900,
  oldMinor: 23900,
  image: "/dev/kit/tomato.png",
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
