import { ShoppingBasket } from "lucide-react";
import { type ReactNode, useState } from "react";
import { CategoryPhoto } from "./CategoryPhoto";
import { imageSource, type ProductImageValue } from "./product-image";
export type CategorySize = "1x1" | "2x1" | "1x2" | "2x2";
export function CategoryTile({
  name,
  image,
  href,
  size = "1x1",
  icon,
  column,
  row,
}: {
  name: string;
  image?: ProductImageValue;
  href: string;
  size?: CategorySize;
  icon?: ReactNode;
  column?: number;
  row?: number;
}) {
  const source = imageSource(image);
  const [failed, setFailed] = useState<string>();
  return (
    <a
      href={href}
      data-size={size}
      className="category-tile"
      style={
        column
          ? {
              gridColumn: `${column}/span ${size.startsWith("2") ? 2 : 1}`,
              gridRow: `${row}/span ${size.endsWith("2") ? 2 : 1}`,
            }
          : undefined
      }
    >
      <span className="category-label">{name}</span>
      <span className="category-photo-zone" aria-hidden>
        {source.src && source.src !== failed ? (
          <CategoryPhoto source={source} onError={() => setFailed(source.src)} />
        ) : (
          <span aria-hidden className="category-fallback">
            {icon ?? <ShoppingBasket size={40} />}
          </span>
        )}
      </span>
    </a>
  );
}
