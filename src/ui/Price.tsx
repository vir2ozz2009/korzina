import { useLayoutEffect, useRef } from "react";
import { formatMinor } from "../shared/money";
export interface PriceProps {
  amountMinor: number;
  from?: boolean;
  oldMinor?: number;
  currency: string;
  size?: "price" | "display" | "title-3";
}
const sizes = { price: "text-price", display: "text-display", "title-3": "text-title-3" };
export function Price({ amountMinor, oldMinor, from, currency, size = "price" }: PriceProps) {
  const label = `${from ? "от " : ""}${formatMinor(amountMinor, currency)}`;
  const valueRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const value = valueRef.current;
    const frame = value?.parentElement;
    if (!value || !frame || !label || size !== "price") return;
    const resizePrice = () => {
      value.classList.remove("text-title-3");
      value.classList.add("text-price");
      if (value.scrollWidth > frame.clientWidth) value.classList.replace("text-price", "text-title-3");
    };
    const observer = new ResizeObserver(resizePrice);
    observer.observe(frame);
    resizePrice();
    return () => observer.disconnect();
  }, [label, size]);
  const discount = oldMinor !== undefined && oldMinor > amountMinor;
  return (
    <span className="inline-flex min-w-0 max-w-full flex-wrap items-baseline gap-x-2 gap-y-0">
      <span
        ref={valueRef}
        className={`shrink-0 whitespace-nowrap ${sizes[size]} ${discount ? "text-primary-text" : ""}`}
      >
        {label}
      </span>
      {discount && (
        <del className="whitespace-nowrap text-meta text-subtle-foreground">{formatMinor(oldMinor, currency)}</del>
      )}
    </span>
  );
}
