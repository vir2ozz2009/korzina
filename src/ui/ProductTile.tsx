import { AddToCart, type AddToCartProps } from "./AddToCart";
import { DiscountBadge } from "./DiscountBadge";
import { Price, type PriceProps } from "./Price";
import { ProductImage } from "./ProductImage";
export interface ProductTileProps extends PriceProps {
  name: string;
  unit: string;
  image?: string;
  href: string;
  cart: AddToCartProps;
}
export function ProductTile({ name, unit, image, href, cart, ...price }: ProductTileProps) {
  return (
    <article className="min-w-0 overflow-hidden rounded-xl bg-card">
      <a href={href} className={`relative block ${cart.max <= 0 ? "opacity-50" : ""}`} aria-label={name}>
        <ProductImage src={image} alt={name} className="aspect-[179/142] w-full" />
        <span className="absolute top-2 left-2">
          <DiscountBadge {...price} />
        </span>
      </a>
      <div className="space-y-1 p-2.5">
        <a href={href} className="line-clamp-2 min-h-9 text-caption">
          {name}
        </a>
        <p className="text-small text-muted-foreground">{unit}</p>
        <Price {...price} />
        {cart.max > 0 ? (
          <AddToCart {...cart} />
        ) : (
          <p className="flex min-h-(--control-md) items-center justify-center rounded-pill bg-input text-small text-muted-foreground">
            Нет в наличии
          </p>
        )}
      </div>
    </article>
  );
}
