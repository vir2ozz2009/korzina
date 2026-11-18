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
  onOpen?: () => void;
  cart: AddToCartProps;
  stock?: number | null;
}
export function ProductTile({ name, unit, image, href, onOpen, cart, stock, ...price }: ProductTileProps) {
  return (
    <article className="min-w-0 overflow-hidden rounded-xl bg-card">
      <a
        href={href}
        onClick={onOpen}
        className={`relative block ${cart.max <= 0 ? "opacity-50" : ""}`}
        aria-label={name}
      >
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
        <a href={href} onClick={onOpen} className="line-clamp-2 min-h-9 text-caption">
          {name}
        </a>
        <p className="text-small text-muted-foreground">{unit}</p>
        <div className="flex min-h-7 flex-wrap items-baseline justify-between gap-x-1">
          <Price {...price} />
          {stock !== undefined && stock !== null && stock > 0 && stock <= 5 && (
            <span className="text-micro font-normal text-subtle-foreground">{stock} осталось</span>
          )}
        </div>
        {cart.max > 0 || cart.value > 0 ? (
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
