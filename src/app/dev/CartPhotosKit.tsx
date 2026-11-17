import { useState } from "react";
import { addMinor, multiplyMinor } from "../../shared/money";
import { Button } from "../../ui/Button";
import { Divider } from "../../ui/Divider";
import { KitSection } from "../../ui/KitSection";
import { ProductRow } from "../../ui/ProductRow";
import { TotalsBlock } from "../../ui/TotalsBlock";
import { demoProduct, photoModes } from "./kit-mock";

export function CartPhotosKit() {
  const [counts, setCounts] = useState<Record<string, number>>({ photo: 1, cutout: 1 });
  const productsMinor = addMinor(
    ...Object.values(counts).map((count) => multiplyMinor(demoProduct.amountMinor, count)),
  );
  return (
    <section id="kit-product-cart" aria-label="Демо-корзина">
      <KitSection title="Корзина · пример">
        {photoModes.map(({ label, image, mode }) => (
          <div key={mode} className="space-y-3">
            <p className="text-micro text-muted-foreground">{label}</p>
            {counts[mode] ? (
              <ProductRow
                {...demoProduct}
                image={image}
                oldMinor={mode === "photo" ? undefined : demoProduct.oldMinor}
                variant="cart"
                quantity={counts[mode]}
                max={3}
                onChange={(value) => setCounts((counts) => ({ ...counts, [mode]: value }))}
                onRemove={() => setCounts((counts) => ({ ...counts, [mode]: 0 }))}
              />
            ) : (
              <Button variant="secondary" onClick={() => setCounts((counts) => ({ ...counts, [mode]: 1 }))}>
                Вернуть товар
              </Button>
            )}
            <Divider />
          </div>
        ))}
        <TotalsBlock
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
