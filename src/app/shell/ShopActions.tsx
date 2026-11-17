import { useRouter } from "@tanstack/react-router";
import { useCart } from "../../features/cart";
import { FloatingActions } from "../../ui/FloatingActions";

export function ShopActions() {
  const router = useRouter();
  const { query } = useCart();
  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-(--floating-bottom) z-20 mx-auto max-w-(--content-max)">
      <div className="pointer-events-auto">
        <FloatingActions
          count={query.data?.count ?? 0}
          totalMinor={query.data?.totalMinor ?? 0}
          currency={query.data?.currency}
          onCart={() => void router.navigate({ to: "/cart", search: (previous) => ({ shop: previous.shop }) })}
        />
      </div>
    </div>
  );
}
