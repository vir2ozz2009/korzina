import type { StorefrontProduct } from "../../../shared/catalog/model";
import { selectOffer } from "../../../shared/catalog/offer";
import type { useCart } from "../../cart";
import type { HomeViewProps } from "./HomeView";

export function toTiles({
  products,
  currency,
  cart,
  choose,
  preferred,
}: {
  products: StorefrontProduct[];
  currency: string;
  cart: ReturnType<typeof useCart>;
  choose: (id: string) => void;
  preferred?: Record<string, string>;
}): HomeViewProps["products"] {
  const lines = cart.query.data?.lines ?? [];
  return products.map((product) => {
    const offer = selectOffer(product.variants, lines, product.id);
    const manual = product.variants.find((v) => v.id === preferred?.[product.id] && v.available);
    const variant = manual ?? offer.variant;
    const value = manual ? (lines.find((line) => line.variantId === manual.id)?.quantity ?? 0) : offer.quantity;
    const multiple = !manual && offer.multiple;
    const available = selectOffer(product.variants, [], product.id);
    return {
      id: product.id,
      name: product.name,
      image: product.image ?? undefined,
      href: `/p/${product.id}${manual ? `?variant=${encodeURIComponent(manual.id)}` : ""}`,
      unit: multiple ? "" : (manual?.name ?? offer.unit),
      variants: available.multiple ? { label: available.unit, open: () => choose(product.id) } : undefined,
      from: !manual && offer.from,
      stock: multiple ? undefined : variant.stock,
      amountMinor: variant.priceMinor,
      oldMinor: variant.oldPriceMinor ?? undefined,
      currency,
      cart: {
        value,
        max: variant.available ? (variant.stock ?? 999) : 0,
        loading: cart.pendingProducts.has(product.id),
        disabled: !cart.query.data,
        onChooseVariant: multiple ? () => choose(product.id) : undefined,
        onChange: (quantity) =>
          cart.change(
            {
              variantId: variant.id,
              productId: product.id,
              name: product.name,
              unit: variant.name,
              quantity: value,
              priceMinor: variant.priceMinor,
              stock: variant.stock,
              available: variant.available,
            },
            quantity,
            currency,
          ),
      },
    };
  });
}
