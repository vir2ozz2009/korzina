import { X } from "lucide-react";
import { IconButton } from "./IconButton";
import { Price, type PriceProps } from "./Price";
import { ProductImage } from "./ProductImage";
import { imageSource, type ProductImageValue } from "./product-image";
import { Stepper } from "./Stepper";
export interface ProductRowProps extends PriceProps {
  name: string;
  unit: string;
  image?: ProductImageValue;
  quantity: number;
  max?: number;
  variant?: "cart" | "order" | "change";
  previous?: string;
  onChange?: (value: number) => void;
  onRemove?: () => void;
}
export function ProductRow({
  name,
  unit,
  image,
  quantity,
  max = quantity,
  variant = "order",
  previous,
  onChange,
  onRemove,
  ...price
}: ProductRowProps) {
  return (
    <div className="flex gap-3">
      <ProductImage {...imageSource(image)} alt={name} sizes="80px" className="w-20 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start justify-between gap-1">
          <p className="text-label">{name}</p>
          {variant === "cart" && (
            <IconButton aria-label={`Удалить ${name}`} onClick={onRemove}>
              <X size={20} />
            </IconButton>
          )}
        </div>
        <p className="text-meta text-muted-foreground">
          {unit}
          {variant !== "cart" && ` · ${quantity} шт.`}
        </p>
        {variant === "change" && previous && <del className="block text-small text-subtle-foreground">{previous}</del>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {variant === "cart" && onChange && <Stepper value={quantity} max={max} onChange={onChange} />}
          <Price {...price} size="title-3" />
        </div>
      </div>
    </div>
  );
}
