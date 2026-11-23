import { Copy, Phone } from "lucide-react";
import type { ReactNode } from "react";
import type { SellerOrder } from "../../../../shared/contracts/seller-order";
import { formatMinor } from "../../../../shared/money";
import { Button } from "../../../../ui/Button";
import { Card } from "../../../../ui/Card";
import { methodLabel, PaymentPill, StagePill, StageProgress } from "./OrderIndicators";
import { paymentLabel } from "./OrderPaymentSheet";
import type { OrderAction } from "./order-actions";

export function OrderDetails({
  order,
  pending,
  action,
  composition,
}: {
  order: SellerOrder;
  pending: boolean;
  action: (action: OrderAction) => void;
  composition: ReactNode;
}) {
  const { receiving, fulfillment, balance } = order;
  const amount = (value: number) => formatMinor(value, order.currency);
  const canPay = order.permissions.payments;
  const delivery = receiving.mode === "delivery";
  const address = delivery
    ? [
        receiving.address,
        receiving.apartment && `кв. ${receiving.apartment}`,
        receiving.entrance && `подъезд ${receiving.entrance}`,
        receiving.floor && `этаж ${receiving.floor}`,
        receiving.intercom && `домофон ${receiving.intercom}`,
      ]
        .filter(Boolean)
        .join(", ")
    : undefined;
  return (
    <>
      <Card>
        <p className="text-meta text-muted-foreground">Клиент видит №{order.number}</p>
        <div className="flex flex-wrap gap-1.5">
          <StagePill stage={order.stage} method={receiving.mode} />
          <PaymentPill
            status={order.paymentStatus}
            stage={order.stage}
            debt={balance.debtMinor}
            refund={balance.refundMinor}
            currency={order.currency}
          />
        </div>
        <StageProgress stage={order.stage} method={receiving.mode} />
      </Card>
      <Card>
        <h2 className="text-title-3">Покупатель</h2>
        <p>{order.customerName ?? "Имя не указано"}</p>
        {order.phone && (
          <a href={`tel:${order.phone}`} className="inline-flex min-h-11 items-center gap-2 text-primary-text">
            <Phone aria-hidden="true" size={18} />
            {order.phone}
          </a>
        )}
      </Card>
      {composition}
      <Card>
        <h2 className="text-title-3">Получение</h2>
        <p className="text-label">{methodLabel[receiving.mode]}</p>
        {address && (
          <>
            <p>{address}</p>
            <Button
              variant="soft"
              icon={<Copy aria-hidden="true" size={16} />}
              onClick={() => void navigator.clipboard.writeText(address)}
            >
              Скопировать адрес
            </Button>
          </>
        )}
        {delivery && receiving.acceptedWithoutPoint && <p className="text-meta">Адрес не проверен на карте</p>}
        {receiving.comment && <p className="break-words">{receiving.comment}</p>}
        {fulfillment.mode === "delivery" &&
          fulfillment.tariff === "after_order" &&
          order.stage !== "cancelled" &&
          canPay &&
          (!order.deliveryAssigned || balance.outstandingMinor > 0) && (
            <Button full variant="secondary" disabled={pending} onClick={() => action("setDeliveryFee")}>
              Назначить стоимость доставки
            </Button>
          )}
      </Card>
      <Card>
        <h2 className="text-title-3">Оплата · {order.paymentOption?.name ?? paymentLabel[order.payment]}</h2>
        {order.topUpPayment && <p>Способ доплаты · {order.topUpPayment.name}</p>}
        <dl className="space-y-1">
          <div className="flex justify-between gap-2">
            <dt>Товары</dt>
            <dd>{amount(order.itemsMinor)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Доставка</dt>
            <dd>{amount(order.deliveryMinor)}</dd>
          </div>
          <div className="flex justify-between gap-2 text-label">
            <dt>Итого магазину</dt>
            <dd>{amount(order.totalMinor)}</dd>
          </div>
        </dl>
        {fulfillment.mode === "delivery" && fulfillment.payee === "courier" && (
          <p>Доставку оплачивают курьеру{fulfillment.feeMinor !== null && ` · ${amount(fulfillment.feeMinor)}`}</p>
        )}
        <p>
          {paymentLabel[balance.latestPayment?.method ?? order.payment]} · Получено {amount(balance.paidMinor)}
        </p>
        {balance.refundMinor > 0 && (
          <p className="text-label">
            {order.stage === "cancelled"
              ? `Вернуть ${amount(balance.refundMinor)}`
              : `Клиент переплатил ${amount(balance.refundMinor)} — верните`}
          </p>
        )}
        {balance.receiptReason && order.paymentStatus === "rejected" && (
          <p>Причина отклонения · {balance.receiptReason}</p>
        )}
        {canPay ? (
          <div className="grid gap-2">
            {order.paymentStatus === "pending_review" && order.receipts.length > 0 && (
              <Button full disabled={pending} onClick={() => action("confirmTransfer")}>
                Проверить перевод
              </Button>
            )}
            {order.paymentStatus !== "pending_review" && order.receipts.length > 0 && (
              <Button full variant="secondary" disabled={pending} onClick={() => action("confirmTransfer")}>
                Просмотр чеков
              </Button>
            )}
            <Button full variant="soft" disabled={pending} onClick={() => action("recordPayment")}>
              Записать оплату
            </Button>
            {balance.latestPayment && (
              <Button full variant="secondary" disabled={pending} onClick={() => action("correctPayment")}>
                Исправить оплату
              </Button>
            )}
            {balance.debtMinor > 0 && (
              <Button full variant="secondary" disabled={pending} onClick={() => action("waiveDue")}>
                Списать долг
              </Button>
            )}
            {balance.refundMinor > 0 && (
              <Button full variant="secondary" disabled={pending} onClick={() => action("markRefundReturned")}>
                Вернул
              </Button>
            )}
          </div>
        ) : (
          <p className="text-meta text-muted-foreground">Оплата доступна для просмотра</p>
        )}
      </Card>
    </>
  );
}
