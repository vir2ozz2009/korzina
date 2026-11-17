import { useState } from "react";
import { BrandTile } from "../../ui/BrandTile";
import { Button } from "../../ui/Button";
import { CategoryTile } from "../../ui/CategoryTile";
import { DiscountBadge } from "../../ui/DiscountBadge";
import { Gallery } from "../../ui/Gallery";
import { KitSection } from "../../ui/KitSection";
import { Price } from "../../ui/Price";
import { ProductRow } from "../../ui/ProductRow";
import { ProductTile } from "../../ui/ProductTile";
import { demoProduct } from "./kit-mock";
export function ProductsKit({ notify }: { notify: (message: string) => void }) {
  const [quantity, setQuantity] = useState(0);
  const [row, setRow] = useState(1);
  const [removed, setRemoved] = useState(false);
  return (
    <div className="space-y-3">
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
      <section aria-label="Плитки товаров" className="grid grid-cols-2 gap-2">
        <ProductTile
          {...demoProduct}
          cart={{ value: quantity, max: 3, onChange: setQuantity }}
          href="#product-example"
        />
        <ProductTile
          {...demoProduct}
          name="Томаты · нет в наличии"
          oldMinor={undefined}
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
      <KitSection title="Строки товара">
        {removed ? (
          <Button variant="secondary" onClick={() => setRemoved(false)}>
            Вернуть товар
          </Button>
        ) : (
          <ProductRow
            {...demoProduct}
            quantity={row}
            max={3}
            variant="cart"
            onChange={setRow}
            onRemove={() => setRemoved(true)}
          />
        )}
        <ProductRow {...demoProduct} quantity={2} variant="order" />
        <ProductRow {...demoProduct} quantity={1} variant="change" previous="1 кг · 378 ₽" />
      </KitSection>
      <div id="product-example">
        <KitSection title="Галерея">
          <p className="text-meta text-muted-foreground">Свайпайте. Нажмите, чтобы открыть фото целиком.</p>
          <Gallery name="Томаты на ветке" images={[demoProduct.image, `${demoProduct.image}?view=2`]} />
        </KitSection>
      </div>
      <section aria-label="Категории" className="grid grid-cols-3 gap-2">
        <CategoryTile name="Овощи" image={demoProduct.image} href="#product-example" wide />
        <CategoryTile name="Фрукты" href="#product-example" />
        <CategoryTile name="На каждый день" href="#product-example" />
      </section>
      <div className="flex gap-2 overflow-x-auto">
        <BrandTile name="Korzina" logo="/brand/korzina.svg" href="#product-example" />
        <BrandTile name="Местная ферма" href="#product-example" />
      </div>
    </div>
  );
}
