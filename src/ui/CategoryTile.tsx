import { ProductImage } from "./ProductImage";
export function CategoryTile({
  name,
  image,
  href,
  wide = false,
}: {
  name: string;
  image?: string;
  href: string;
  wide?: boolean;
}) {
  return (
    <a
      href={href}
      className={`relative block min-h-28 overflow-hidden rounded-lg bg-card p-3 ${wide ? "col-span-2" : ""}`}
    >
      <span className="relative z-10 text-small font-semibold">{name}</span>
      {image && <ProductImage src={image} alt={name} className="absolute right-0 bottom-0 h-20 w-24" />}
    </a>
  );
}
