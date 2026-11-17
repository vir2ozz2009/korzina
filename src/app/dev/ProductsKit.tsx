import { useState } from "react";
import { BrandTile } from "../../ui/BrandTile";
import { DiscountBadge } from "../../ui/DiscountBadge";
import { Gallery } from "../../ui/Gallery";
import { Img } from "../../ui/Img";
import { KitSection } from "../../ui/KitSection";
import { Price } from "../../ui/Price";
import { ProductRow } from "../../ui/ProductRow";
import { ProductTile } from "../../ui/ProductTile";
import { CartPhotosKit } from "./CartPhotosKit";
import { CategoriesKit } from "./CategoriesKit";
import { demoProduct, photoModes } from "./kit-mock";

export function ProductsKit({ notify }: { notify: (message: string) => void }) {
  const [quantity, setQuantity] = useState(0);
  return (
    <div className="space-y-3">
      <KitSection title="Img · загрузка и ошибка">
        <div className="grid grid-cols-2 gap-2">
          <Img src="/seed/tomato-photo-800.webp" alt="Фото" className="aspect-square rounded-md" />
          <Img src="/seed/missing.webp" alt="Нет фото" className="aspect-square rounded-md" />
        </div>
      </KitSection>
      <KitSection title="Цены">
        <div>
          <Price amountMinor={18900} />
        </div>
        <div>
          <Price amountMinor={18900} oldMinor={23900} size="display" />
        </div>
        <div>
          <Price amountMinor={18950} size="title-3" />
        </div>
        <div className="flex gap-2">
          <DiscountBadge amountMinor={18900} oldMinor={23900} />
          <span className="text-small text-muted-foreground">Бейдж появляется при скидке</span>
        </div>
      </KitSection>
      <section id="kit-product-tiles" aria-label="Плитки: фото и вырезка" className="space-y-3">
        <h2 className="px-2 text-title-2">Два режима фото</h2>
        <div className="grid grid-cols-2 gap-2">
          {photoModes.map(({ label, image }) => (
            <div key={label} className="space-y-2">
              <p className="px-2 text-label">{label}</p>
              <ProductTile
                {...demoProduct}
                image={image}
                cart={{ value: quantity, max: 3, onChange: setQuantity }}
                href="#product-example"
              />
            </div>
          ))}
        </div>
      </section>
      <section id="kit-product-rows" aria-label="Строки: фото и вырезка">
        <KitSection title="Строки товара">
          {photoModes.map(({ label, image }) => (
            <div key={label} className="space-y-3">
              <p className="text-micro text-muted-foreground">{label} · одна и две цены</p>
              <ProductRow {...demoProduct} image={image} oldMinor={undefined} quantity={1} variant="order" />
              <ProductRow {...demoProduct} image={image} quantity={2} variant="order" />
            </div>
          ))}
          <ProductRow {...demoProduct} quantity={1} variant="change" previous="1 кг · 378 ₽" />
        </KitSection>
      </section>
      <section id="kit-product-gallery" aria-label="Галереи: фото и вырезка">
        <KitSection title="Галерея">
          <p className="text-meta text-muted-foreground">
            Нажмите на фото: откроется оригинал. Разведите пальцы, чтобы увеличить.
          </p>
          <div id="product-example" className="grid grid-cols-2 gap-2">
            {photoModes.map(({ label, image }) => (
              <div key={label} className="min-w-0 space-y-2">
                <p className="text-label">{label}</p>
                <Gallery
                  name={`Томаты · ${label}`}
                  images={[image, { ...image, src: `${image.src}?view=2` }]}
                  sizes="(max-width: 480px) calc((100vw - 72px) / 2), 204px"
                />
              </div>
            ))}
          </div>
        </KitSection>
      </section>
      <CategoriesKit />
      <CartPhotosKit />
      <section aria-label="Состояния плитки" className="grid grid-cols-2 gap-2">
        <ProductTile
          {...demoProduct}
          name="Нет в наличии"
          cart={{ value: 0, max: 0, onChange: setQuantity }}
          href="#product-example"
        />
        <ProductTile
          {...demoProduct}
          name="Товар без фотографии"
          image={undefined}
          oldMinor={undefined}
          cart={{
            value: 0,
            max: 3,
            onChange: setQuantity,
            onChooseVariant: () => notify("Выберите фасовку в разделе Действия"),
          }}
          href="#product-example"
        />
        <ProductTile
          {...demoProduct}
          name="Томаты · загрузка"
          cart={{ value: 1, max: 3, onChange: setQuantity, loading: true }}
          href="#product-example"
        />
      </section>
      <div className="flex gap-2 overflow-x-auto">
        <BrandTile name="Korzina" logo="/brand/korzina.svg" href="#product-example" />
        <BrandTile name="Местная ферма" href="#product-example" />
      </div>
    </div>
  );
}
