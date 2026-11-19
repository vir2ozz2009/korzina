import type { CartLine } from "../contracts/cart";

interface Variant {
  id: string;
  name: string;
  priceMinor: number;
  oldPriceMinor: number | null;
  stock: number | null;
  available: boolean;
}
const plural = new Intl.PluralRules("ru");
const forms: Record<string, string> = { one: "фасовка", few: "фасовки", many: "фасовок", other: "фасовки" };
export function selectOffer<T extends Variant>(variants: T[], lines: CartLine[], productId: string) {
  const available = variants.filter((v) => v.available);
  const selected = lines.filter((l) => l.productId === productId && l.quantity > 0).at(-1);
  const cheapest = available.reduce<T | undefined>(
    (min, v) => (!min || v.priceMinor < min.priceMinor ? v : min),
    undefined,
  );
  const current = variants.find((v) => v.id === selected?.variantId) ?? cheapest ?? variants[0];
  const variant =
    selected && current?.id === selected.variantId
      ? { ...current, priceMinor: selected.priceMinor, stock: selected.stock, available: selected.available }
      : current;
  const quantity = lines.find((l) => l.variantId === variant?.id)?.quantity ?? 0;
  const multiple = !quantity && available.length > 1;
  return {
    variant,
    quantity,
    multiple,
    unit: multiple ? `${available.length} ${forms[plural.select(available.length)]}` : variant?.name,
    from: multiple && available.some((v) => v.priceMinor !== variant.priceMinor),
  };
}
