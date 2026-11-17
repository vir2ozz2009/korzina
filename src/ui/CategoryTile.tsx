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
  href?: string;
  size?: CategorySize;
  icon?: ReactNode;
  column?: number;
  row?: number;
}) {
  const Tile = href ? "a" : "div";
  const wide = size.startsWith("2");
  const source = imageSource(image);
  const [failed, setFailed] = useState<string>();
  return (
    <Tile
      href={href}
      data-size={size}
      className={`relative isolate min-w-0 h-full overflow-hidden rounded-lg bg-card ${wide ? "col-span-2 block" : "flex flex-col"} ${size.endsWith("2") ? "row-span-2" : ""}`}
      style={
        column
          ? {
              gridColumn: `${column}/span ${size.startsWith("2") ? 2 : 1}`,
              gridRow: `${row}/span ${size.endsWith("2") ? 2 : 1}`,
            }
          : undefined
      }
    >
      <span
        className={`z-2 line-clamp-2 shrink-0 self-stretch pr-1 text-small font-semibold ${wide ? "absolute top-2.5 left-2.5 w-[45%]" : "relative mx-2.5 mt-2.5 mb-1"}`}
      >
        {name}
      </span>
      <span
        className={`z-0 flex min-h-0 min-w-0 items-end overflow-hidden ${wide ? "absolute inset-y-0 right-0 left-[30%] justify-end p-2" : "relative flex-1 justify-center px-2 pb-2"}`}
        aria-hidden
      >
        {source.src && source.src !== failed ? (
          <CategoryPhoto source={source} onError={() => setFailed(source.src)} />
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
