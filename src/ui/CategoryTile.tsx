import { ShoppingBasket } from "lucide-react";
import { type ReactNode, useState } from "react";
import { imageSource, type ProductImageValue } from "./product-image";

export function CategoryTile({
  name,
  image,
  href,
  wide = false,
  icon,
}: {
  name: string;
  image?: ProductImageValue;
  href: string;
  wide?: boolean;
  icon?: ReactNode;
}) {
  const source = imageSource(image);
  const [failed, setFailed] = useState<string>();
  const hasPhoto = source.src && failed !== source.src;
  return (
    <a
      href={href}
      className={`relative block h-full min-w-0 overflow-hidden rounded-lg bg-card pt-2.5 pl-2.5 ${wide ? "col-span-2" : ""}`}
    >
      <span className="relative z-10 block line-clamp-2 pr-2.5 text-small font-semibold">{name}</span>
      {hasPhoto ? (
        <img
          src={source.src}
          srcSet={source.srcSet}
          sizes={wide ? "153px" : "105px"}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(source.src)}
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] w-full object-cover object-center"
        />
      ) : (
        <span
          aria-hidden
          className="absolute right-2 bottom-2 flex size-16 items-center justify-center rounded-pill bg-primary-soft text-primary-text"
        >
          {icon ?? <ShoppingBasket size={40} />}
        </span>
      )}
    </a>
  );
}
