import type { CartAdjustment } from "../../../shared/contracts/cart";
import type { DeliveryBenefit } from "../../../shared/contracts/promo";
import type { ReceivingAvailability } from "../../../shared/contracts/receiving";
import { deliveryBenefitLabel } from "../../../shared/delivery-benefit";
import { formatMinor } from "../../../shared/money";
import { Card } from "../../../ui/Card";
import { Divider } from "../../../ui/Divider";

export function PurchaseTotals({
  itemsMinor,
  itemsBeforeDiscountMinor,
  adjustments,
  totalMinor,
  deliveryMinor,
  deliveryBenefit,
  currency,
  fulfillment,
  done = false,
}: {
  itemsMinor: number;
  itemsBeforeDiscountMinor?: number;
  adjustments?: CartAdjustment[];
  totalMinor: number;
  deliveryMinor: number;
  deliveryBenefit?: DeliveryBenefit;
  currency: string;
  fulfillment: Extract<ReceivingAvailability, { available: true }>;
  done?: boolean;
}) {
  const amount = (minor: number) => formatMinor(minor, currency);
  const courier = fulfillment.mode === "delivery" && fulfillment.payee === "courier";
  const benefit = deliveryBenefitLabel(deliveryBenefit);
  const lateCost = !benefit && fulfillment.mode === "delivery" && fulfillment.feeMinor === null;
  const deliveryTitle =
    benefit ?? (lateCost ? "Согласуем после заказа" : deliveryMinor ? amount(deliveryMinor) : "Бесплатно");
  return (
    <Card>
      <div className="flex justify-between gap-2">
        <span>Товары</span>
        <strong>{amount(itemsBeforeDiscountMinor ?? itemsMinor)}</strong>
      </div>
      {adjustments
        ?.filter((item) => item.kind === "promotion")
        .map((item) => (
          <div key={item.sourceId} className="flex justify-between gap-2">
            <span>{item.label}</span>
            <strong>−{amount(-item.amount)}</strong>
          </div>
        ))}
      {!courier && (
        <div className="flex justify-between gap-2">
          <span>{fulfillment.mode === "pickup" ? "Самовывоз" : "Доставка"}</span>
          <span>{deliveryTitle}</span>
        </div>
      )}
      {deliveryBenefit?.state === "applied" && (
        <p className="text-caption">
          Исходная доставка {amount(deliveryBenefit.baseMinor ?? 0)} · скидка {amount(deliveryBenefit.amountMinor)} · К
          доплате за доставку 0 ₽
        </p>
      )}
      <Divider />
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-label">
          {courier ? (done ? "Итого магазину" : "К оплате магазину") : lateCost ? "Итого за товары" : "Итого"}
        </span>
        <strong className="text-title-3">{amount(totalMinor)}</strong>
      </div>
      {courier && fulfillment.mode === "delivery" && (
        <p className="text-meta text-muted-foreground">
          Доставку оплачиваете курьеру ·{" "}
          {fulfillment.unverified
            ? "уточнит магазин"
            : fulfillment.feeMinor === null
              ? "по тарифу службы"
              : amount(fulfillment.feeMinor)}
        </p>
      )}
      {done && lateCost && !courier && (
        <p className="text-meta text-muted-foreground">Магазин свяжется с вами и уточнит стоимость.</p>
      )}
    </Card>
  );
}
