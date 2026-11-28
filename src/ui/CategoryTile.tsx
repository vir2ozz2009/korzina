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
  list = false,
}: {
  name: string;
  image?: ProductImageValue;
  href?: string;
  size?: CategorySize;
  icon?: ReactNode;
  column?: number;
  row?: number;
  list?: boolean;
}) {
  const Tile = href ? "a" : "div";
  const wide = size.startsWith("2");
  const source = imageSource(image);
  const [failed, setFailed] = useState<string>();
  return (
    <Tile
      href={href}
      data-size={size}
      className={`relative isolate min-w-0 flex flex-col overflow-hidden rounded-lg bg-card ${list ? "" : "h-full"} ${wide ? "col-span-2" : ""} ${size.endsWith("2") ? "row-span-2" : ""}`}
      style={
        column
          ? {
              gridColumn: `${column}/span ${size.startsWith("2") ? 2 : 1}`,
              gridRow: `${row}/span ${size.endsWith("2") ? 2 : 1}`,
            }
          : undefined
      }
    >
      <span className="relative mx-2.5 mt-2.5 mb-1 line-clamp-2 h-8 shrink-0 wrap-anywhere pr-1 text-small font-semibold">
        {name}
      </span>
      <span
        className={`relative mx-2 mb-2 flex min-h-0 min-w-0 items-center justify-center ${list ? "aspect-square" : "flex-1"}`}
        aria-hidden
      >
        {source.src && source.src !== failed ? (
          <span className={size === "1x1" && !list ? "block h-[70%] w-[70%]" : "block size-full"}>
            <CategoryPhoto source={source} onError={() => setFailed(source.src)} />
          </span>
        ) : (
          <span
            aria-hidden
            className="flex size-16 max-h-full max-w-full items-center justify-center rounded-pill bg-primary-soft text-primary-text"
          >
            {icon ?? <ShoppingBasket size={40} />}
          </span>
        )}
      </span>
    </Tile>
  );
}
