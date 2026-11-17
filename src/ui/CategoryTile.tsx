import { ShoppingBasket } from "lucide-react";
import { ProductImage } from "./ProductImage";
import { imageSource, type ProductImageValue } from "./product-image";
export function CategoryTile({
  name,
  image,
  href,
  wide = false,
}: {
  name: string;
  image?: ProductImageValue;
  href: string;
  wide?: boolean;
}) {
  return (
    <a
      href={href}
      className={`relative block min-h-28 overflow-hidden rounded-lg bg-card p-3 ${wide ? "col-span-2" : ""}`}
    >
      <span className="relative z-10 text-small font-semibold">{name}</span>
      <ProductImage
        {...imageSource(image)}
        alt={name}
        sizes="80px"
        fallback={<ShoppingBasket className="size-8" />}
        className="absolute right-0 bottom-0 w-20"
      />
    </a>
  );
}
