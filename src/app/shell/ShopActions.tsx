import { useRouter } from "@tanstack/react-router";
import { useCart } from "../../features/cart";
import { FloatingActions } from "../../ui/FloatingActions";
import { Unfinished } from "../../ui/Unfinished";
import { useToast } from "./ToastProvider";

export function ShopActions() {
  const router = useRouter();
  const { query } = useCart();
  const toast = useToast();
  const props = {
    count: query.data?.count ?? 0,
    totalMinor: query.data?.totalMinor ?? 0,
    currency: query.data?.currency,
    onCart: () => void router.navigate({ to: "/cart", search: (previous) => ({ shop: previous.shop }) }),
  };
  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-(--floating-bottom) z-20 mx-auto max-w-(--content-max)">
      {import.meta.env.SHOW_UNFINISHED ? (
        <Unfinished task="B5 · Поиск" notify={toast}>
          {(onSearch) => <FloatingActions {...props} onSearch={onSearch} />}
        </Unfinished>
      ) : (
        <FloatingActions {...props} />
      )}
    </div>
  );
}
