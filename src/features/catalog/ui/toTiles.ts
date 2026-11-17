import type { useCart } from "../../cart";
import type { StorefrontProduct } from "../model";
import { selectOffer } from "../offer";
import type { HomeViewProps } from "./HomeView";

export function toTiles({
  products,
  currency,
  cart,
  choose,
}: {
  products: StorefrontProduct[];
  currency: string;
  cart: ReturnType<typeof useCart>;
  choose: (id: string) => void;
}): HomeViewProps["products"] {
  const lines = cart.query.data?.lines ?? [];
  return products.map((product) => {
    const offer = selectOffer(product.variants, lines, product.id);
    const { variant, quantity: value, multiple } = offer;
    return {
      id: product.id,
      name: product.name,
      image: product.image ?? undefined,
      href: `/p/${product.id}`,
      unit: offer.unit,
      from: offer.from,
      stock: multiple ? undefined : variant.stock,
      amountMinor: variant.priceMinor,
      oldMinor: variant.oldPriceMinor ?? undefined,
      currency,
      cart: {
        value,
        max: variant.available ? (variant.stock ?? 999) : 0,
        loading: cart.mutation.isPending && cart.mutation.variables?.line.productId === product.id,
        disabled: cart.mutation.isPending || !cart.query.data,
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
          ),
      },
    };
  });
}
