import { useState } from "react";
import { addMinor, multiplyMinor } from "../../shared/money";
import { Button } from "../../ui/Button";
import { KitSection } from "../../ui/KitSection";
import { ProductRow } from "../../ui/ProductRow";
import { TotalsBlock } from "../../ui/TotalsBlock";
import { demoProduct } from "./kit-mock";

export function CartPhotosKit() {
  const [quantity, setQuantity] = useState(1);
  const productsMinor = multiplyMinor(demoProduct.amountMinor, quantity);
  return (
    <section id="kit-product-cart" aria-label="Демо-корзина">
      <KitSection title="Корзина · пример">
        {quantity ? (
          <ProductRow
            {...demoProduct}
            variant="cart"
            quantity={quantity}
            max={3}
            onChange={setQuantity}
            onRemove={() => setQuantity(0)}
          />
        ) : (
          <Button variant="secondary" onClick={() => setQuantity(1)}>
            Вернуть товар
          </Button>
        )}
        <TotalsBlock
          currency="RUB"
          rows={[
            { label: "Товары", amountMinor: productsMinor },
            { label: "Доставка", amountMinor: 5000 },
          ]}
          totalMinor={addMinor(productsMinor, 5000)}
        />
      </KitSection>
    </section>
  );
}
