import type { SellerOrder } from "../../../../shared/contracts/seller-order";
import { Button } from "../../../../ui/Button";
import { StickyFooter } from "../../../../ui/StickyFooter";
import { ChangeTotals } from "../../../order-changes";
import { isHandoff, type mainAction, type OrderAction } from "./order-actions";

export function OrderNextFooter({
  order,
  next,
  pending,
  allowed,
  replacementPending,
  action,
}: {
  order: SellerOrder;
  next: ReturnType<typeof mainAction>;
  pending: boolean;
  allowed: boolean;
  replacementPending: boolean;
  action: (action: OrderAction) => void;
}) {
  if (!next && !order.composition) return null;
  return (
    <StickyFooter>
      {order.composition && <ChangeTotals totals={order.composition.totals} seller />}
      {next && (
        <Button full loading={pending} disabled={!allowed && !replacementPending} onClick={() => action(next.action)}>
          {next.label}
        </Button>
      )}
      {next && isHandoff(next.action) && replacementPending && (
        <p className="text-center text-small">Передать можно после ответа покупателя</p>
      )}
    </StickyFooter>
  );
}
