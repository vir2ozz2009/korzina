import type { Cart } from "../../../shared/contracts/cart";
import type { ReceivingAvailability } from "../../../shared/contracts/receiving";
import { deliveryBenefitLabel } from "../../../shared/delivery-benefit";
import { formatMinor } from "../../../shared/money";
import { Divider } from "../../../ui/Divider";
import { deliveryLabel } from "../../receiving";

export function CartDeliveryTotals({
  cart,
  currency,
  method,
  shipping,
  total,
}: {
  cart: Cart;
  currency: string;
  method?: "delivery" | "pickup" | null;
  shipping: ReceivingAvailability | null;
  total?: { deliveryMinor: number | null; totalMinor: number };
}) {
  const courier = shipping?.mode === "delivery" && shipping.available && shipping.payee === "courier";
  const benefit = deliveryBenefitLabel(cart.delivery?.benefit);
  const late =
    !benefit &&
    method === "delivery" &&
    (total?.deliveryMinor === null ||
      (shipping?.mode === "delivery" && shipping.available && shipping.feeMinor === null));
  return (
    <>
      {method && (
        <div className="flex justify-between gap-3">
          <span>{method === "pickup" ? "Самовывоз" : "Доставка"}</span>
          <span className="text-right">
            {method === "pickup"
              ? "Бесплатно"
              : (benefit ??
                (cart.delivery?.baseMinor === 0 ? "Доставка уже бесплатна" : deliveryLabel(shipping, currency)))}
          </span>
        </div>
      )}
      {cart.delivery?.missingMinor && !benefit ? (
        <p className="text-caption">До бесплатной доставки ещё {formatMinor(cart.delivery.missingMinor, currency)}</p>
      ) : null}
      {total && (
        <>
          <Divider />
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-label">{courier ? "К оплате магазину" : late ? "Итого за товары" : "Итого"}</span>
            <strong className="text-title-3">{formatMinor(total.totalMinor, currency)}</strong>
          </div>
        </>
      )}
    </>
  );
}
