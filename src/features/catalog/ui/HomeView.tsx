import { BrandTile } from "../../../ui/BrandTile";
import { CategoryRail } from "../../../ui/CategoryRail";
import { CategoryTile } from "../../../ui/CategoryTile";
import { ProductTile, type ProductTileProps } from "../../../ui/ProductTile";
import type { ProductImageValue } from "../../../ui/product-image";
import { SectionHeader } from "../../../ui/SectionHeader";

export interface HomeViewProps {
  onAllProducts?: () => void;
  allProductsHref?: string;
  categories: { id: string; name: string; image?: ProductImageValue }[];
  products: (ProductTileProps & { id: string })[];
  brands: { id: string; name: string; image?: ProductImageValue | null }[];
}

export function HomeView({ categories, products, brands, onAllProducts, allProductsHref }: HomeViewProps) {
  return (
    <div className="space-y-3">
      {categories.length > 0 && (
        <section className="space-y-2">
          <SectionHeader title="Категории" href="/categories" />
          <CategoryRail>
            {categories.map((category, index) => (
              <CategoryTile
                key={category.id}
                {...category}
                href={`/c/${encodeURIComponent(category.id)}`}
                size={index % 4 === 0 || index % 4 === 3 ? "2x1" : "1x1"}
                column={[1, 3, 1, 2][index % 4] + Math.floor(index / 4) * 3}
                row={[1, 1, 2, 2][index % 4]}
              />
            ))}
          </CategoryRail>
        </section>
      )}
      <section className="space-y-3">
        <SectionHeader title="Товары" href={allProductsHref} onClick={onAllProducts} />
        <div className="grid grid-cols-2 gap-2">
          {products.map(({ id, ...product }) => (
            <ProductTile key={id} {...product} />
          ))}
        </div>
      </section>
      {brands.length > 0 && (
        <section className="space-y-2">
          <SectionHeader title="Бренды" href="/brands" />
          <div className="flex gap-2 overflow-x-auto">
            {brands.map((brand) => (
              <BrandTile
                key={brand.id}
                name={brand.name}
                href={`/b/${encodeURIComponent(brand.id)}`}
                logo={typeof brand.image === "string" ? brand.image : brand.image?.src}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
