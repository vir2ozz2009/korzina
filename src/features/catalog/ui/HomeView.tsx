import type { ReactNode } from "react";
import { categoryMosaic } from "../../../shared/catalog/mosaic";
import type { CatalogCategorySize } from "../../../shared/contracts/catalog";
import { BrandTile } from "../../../ui/BrandTile";
import { CategoryRail } from "../../../ui/CategoryRail";
import { CategoryTile } from "../../../ui/CategoryTile";
import { ProductTile, type ProductTileProps } from "../../../ui/ProductTile";
import type { ProductImageValue } from "../../../ui/product-image";
import { SectionHeader } from "../../../ui/SectionHeader";

export interface HomeViewProps {
  onAllProducts?: () => void;
  allProductsHref?: string;
  categories: { id: string; name: string; image?: ProductImageValue; tileSize?: CatalogCategorySize }[];
  products: (ProductTileProps & { id: string })[];
  moreProducts?: ReactNode;
  brands: { id: string; name: string; image?: ProductImageValue | null }[];
}

export function HomeView({
  categories,
  products,
  brands,
  moreProducts,
  onAllProducts,
  allProductsHref,
}: HomeViewProps) {
  return (
    <div className="space-y-3">
      {categories.length > 0 && (
        <section className="space-y-2">
          <SectionHeader title="Категории" href="/categories" />
          <CategoryRail>
            {categoryMosaic(categories).map(({ category, size, column, row }) => (
              <CategoryTile
                key={category.id}
                {...category}
                href={`/c/${encodeURIComponent(category.id)}`}
                size={size}
                column={column}
                row={row}
              />
            ))}
          </CategoryRail>
        </section>
      )}
      <section className="space-y-3">
        <SectionHeader title="Товары" href={allProductsHref} onClick={onAllProducts} />
        <div className="grid grid-cols-2 gap-2">
          {products.map(({ id, ...product }) => (
            <ProductTile key={id} {...product} photoShape="square" />
          ))}
        </div>
        {moreProducts}
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
