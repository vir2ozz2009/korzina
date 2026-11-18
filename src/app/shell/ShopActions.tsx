import { useRouter } from "@tanstack/react-router";
import { useCart } from "../../features/cart";
import { FloatingActions } from "../../ui/FloatingActions";

export function ShopActions({ compact, search }: { compact: boolean; search: boolean }) {
  const router = useRouter();
  const { query } = useCart();
  const props = {
    count: query.data?.count ?? 0,
    totalMinor: query.data?.totalMinor ?? 0,
    currency: query.data?.currency,
    compact,
    onCart: () => void router.navigate({ to: "/cart", search: (previous) => ({ shop: previous.shop }) }),
  };
  return (
    <div
      data-shop-actions
      className="pointer-events-none fixed inset-x-3 bottom-(--floating-bottom) z-20 mx-auto max-w-(--content-max)"
    >
      <FloatingActions
        {...props}
        onSearch={
          !compact && search
            ? () => void router.navigate({ to: "/search", search: (previous) => ({ shop: previous.shop }) })
            : undefined
        }
      />
    </div>
  );
}
