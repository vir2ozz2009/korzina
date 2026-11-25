import { useEffect } from "react";
import type { Cart } from "../../../shared/contracts/cart";

export function usePromoRefresh(promo: Cart["promo"], refetch: (options: { cancelRefetch: boolean }) => unknown) {
  useEffect(() => {
    if (!promo) return;
    const refresh = () => {
      if (document.visibilityState === "visible") void refetch({ cancelRefetch: false });
    };
    const timer = window.setInterval(refresh, 30_000);
    const boundary = promo.nextChangeAt
      ? window.setTimeout(refresh, Math.min(2 ** 31 - 1, Math.max(250, promo.nextChangeAt - Date.now() + 100)))
      : undefined;
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(boundary);
    };
  }, [promo, refetch]);
}
