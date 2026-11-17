import { useState } from "react";
import { PublicProductLink } from "../../../app/shell/RouteLink";
import { useToast } from "../../../app/shell/ToastProvider";
import { AddToCart } from "../../../ui/AddToCart";
import { Card } from "../../../ui/Card";
import { Price } from "../../../ui/Price";
import { ProductImage } from "../../../ui/ProductImage";

export const demoImage = { src: "/seed/tomato-cutout-400.webp", display: "cutout" as const };
export function DemoProductTile({ index = 0 }: { index?: number }) {
  const [quantity, setQuantity] = useState(0);
  const toast = useToast();
  return (
    <Card className="overflow-hidden p-0">
      <PublicProductLink aria-label={`Томаты на ветке ${index + 1}`} className="block">
        <ProductImage {...demoImage} alt="Томаты на ветке" shape="tile" className="w-full" />
        <div className="px-3">
          <p className="min-h-9 text-caption">Томаты на ветке</p>
          <p className="text-small text-muted-foreground">500 г</p>
          <Price amountMinor={18900} />
        </div>
      </PublicProductLink>
      <div className="p-3 pt-0">
        <AddToCart
          value={quantity}
          max={10}
          onChange={(value) => {
            setQuantity(value);
            if (value > quantity) toast("Добавлено в демо-корзину");
          }}
        />
      </div>
    </Card>
  );
}
export function DemoProducts({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => i + 1042).map((id) => (
        <DemoProductTile key={id} index={id} />
      ))}
    </>
  );
}
