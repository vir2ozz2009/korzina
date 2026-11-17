import { LoaderCircle, Minus, Plus } from "lucide-react";
import { Button } from "./Button";
import { interactive } from "./interactive";
export interface AddToCartProps {
  value: number;
  max: number;
  onChange: (value: number) => void;
  size?: "md" | "lg";
  loading?: boolean;
  disabled?: boolean;
  onChooseVariant?: () => void;
}
export function AddToCart({ value, max, onChange, size = "md", loading, disabled, onChooseVariant }: AddToCartProps) {
  if (value === 0)
    return (
      <Button
        full
        size={size}
        variant="soft"
        aria-label={onChooseVariant ? "Выбрать фасовку" : "Добавить в корзину"}
        loading={loading}
        disabled={disabled || max <= 0}
        onClick={() => (onChooseVariant ? onChooseVariant() : onChange(1))}
      >
        <Plus size={24} />
      </Button>
    );
  const blocked = disabled || loading;
  return (
    <div
      aria-busy={loading || undefined}
      className={`relative flex items-center justify-between rounded-pill bg-primary text-primary-foreground ${size === "lg" ? "h-(--control-lg)" : "h-(--control-md)"}`}
    >
      <button
        type="button"
        aria-label="Убрать одну штуку"
        disabled={blocked}
        onClick={() => onChange(Math.max(0, value - 1))}
        className={`${interactive} flex size-11 items-center justify-center rounded-pill`}
      >
        <Minus size={20} />
      </button>
      <output aria-label="В корзине" className="text-label">
        {loading ? (
          <LoaderCircle aria-label="Загрузка" className="size-5 animate-spin motion-reduce:animate-none" />
        ) : (
          value
        )}
      </output>
      <button
        type="button"
        aria-label="Добавить одну штуку"
        title={value >= max ? "Больше нет" : undefined}
        disabled={blocked || value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className={`${interactive} flex size-11 items-center justify-center rounded-pill`}
      >
        <Plus size={20} />
      </button>
    </div>
  );
}
