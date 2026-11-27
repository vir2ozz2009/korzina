import { useEffect, useRef, useState } from "react";
import type { Cart } from "../../../shared/contracts/cart";

export function useCartDetails(cart?: Cart) {
  const returnFocus = useRef<HTMLElement | null>(null);
  const [detail, setDetail] = useState<{ sourceId: string; variantId?: string }>();
  const adjustment = cart?.adjustments.find(({ sourceId }) => sourceId === detail?.sourceId);
  useEffect(() => {
    if (!adjustment) setDetail(undefined);
  }, [adjustment]);
  return {
    detail,
    adjustment,
    returnFocus,
    open(sourceId: string, trigger: HTMLElement, variantId?: string) {
      returnFocus.current = trigger;
      setDetail({ sourceId, variantId });
    },
    close: () => setDetail(undefined),
  };
}
