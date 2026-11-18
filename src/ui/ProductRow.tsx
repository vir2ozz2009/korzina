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
  onOpen?: () => void;
  note?: string;
  unavailable?: boolean;
  disabled?: boolean;
  removeDisabled?: boolean;
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
  onOpen,
  note,
  unavailable,
  disabled,
  removeDisabled,
  ...price
}: ProductRowProps) {
  const photo = (
    <ProductImage
      {...imageSource(image)}
      alt={onOpen && !unavailable ? "" : name}
      sizes="80px"
      className={`w-20 shrink-0 ${unavailable ? "opacity-50" : ""}`}
    />
  );
  return (
    <div className="flex gap-3">
      {onOpen && !unavailable ? (
        <button type="button" aria-label={name} className="self-start rounded-md" onClick={onOpen}>
          {photo}
        </button>
      ) : (
        photo
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start justify-between gap-1">
          {onOpen && !unavailable ? (
            <button type="button" onClick={onOpen} className="text-left text-label">
              {name}
            </button>
          ) : (
            <p className={`text-label ${unavailable ? "text-muted-foreground" : ""}`}>{name}</p>
          )}
          {variant === "cart" && (
            <IconButton aria-label={`Удалить ${name}`} onClick={onRemove} disabled={removeDisabled}>
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
          {variant === "cart" && !unavailable && onChange && (
            <Stepper value={quantity} max={max} onChange={onChange} disabled={disabled} />
          )}
          {variant === "cart" ? (
            <span className={`ml-auto flex flex-col items-end ${unavailable ? "text-muted-foreground" : ""}`}>
              {previous && <del className="whitespace-nowrap text-small text-subtle-foreground">{previous}</del>}
              <Price {...price} size="title-3" />
            </span>
          ) : (
            <Price {...price} size="title-3" />
          )}
        </div>
        {note && <p className="text-small text-status-warning-foreground">{note}</p>}
      </div>
    </div>
  );
}
