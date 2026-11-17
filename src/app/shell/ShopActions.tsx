import { useRouter } from "@tanstack/react-router";
import { useCart } from "../../features/cart";
import { FloatingActions } from "../../ui/FloatingActions";

export function ShopActions({ product }: { product: boolean }) {
  const router = useRouter();
  const { query } = useCart();
  return (
    <div
      className={`pointer-events-none fixed inset-x-3 z-20 mx-auto max-w-(--content-max) ${product ? "bottom-[calc(var(--control-lg)+2rem+var(--safe-bottom))]" : "bottom-(--floating-bottom)"}`}
    >
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
