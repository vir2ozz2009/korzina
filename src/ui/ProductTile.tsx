import { AddToCart, type AddToCartProps } from "./AddToCart";
import { DiscountBadge } from "./DiscountBadge";
import { Price, type PriceProps } from "./Price";
import { ProductImage } from "./ProductImage";
import { imageSource, type ProductImageValue } from "./product-image";
export interface ProductTileProps extends PriceProps {
  name: string;
  unit: string;
  image?: ProductImageValue;
  href: string;
  cart: AddToCartProps;
}
export function ProductTile({ name, unit, image, href, cart, ...price }: ProductTileProps) {
  return (
    <article className="min-w-0 overflow-hidden rounded-xl bg-card">
      <a href={href} className={`relative block ${cart.max <= 0 ? "opacity-50" : ""}`} aria-label={name}>
        <ProductImage
          {...imageSource(image)}
          alt={name}
          shape="tile"
          sizes="(max-width: 480px) calc((100vw - 32px) / 2), 224px"
          className="w-full"
        />
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
