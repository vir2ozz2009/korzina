import { Bike, ChevronRight, Store } from "lucide-react";
import type { SellerOrderSummary } from "../../../../shared/contracts/seller-order";
import { formatShopDay, shopDateTime } from "../../../../shared/datetime";
import { formatMinor } from "../../../../shared/money";
import { Button } from "../../../../ui/Button";
import { Card } from "../../../../ui/Card";
import { StatusPill } from "../../../../ui/StatusPill";
import { methodLabel, PaymentPill, StagePill, StageProgress } from "./OrderIndicators";
import { mainAction } from "./order-actions";

export function OrderListCard({
  order,
  timeZone,
  pending,
  open,
  next,
}: {
  order: SellerOrderSummary;
  timeZone: string;
  pending: boolean;
  open: () => void;
  next: () => void;
}) {
  const Receiving = order.method === "delivery" ? Bike : Store;
  const action = mainAction(order.stage, order.method === "delivery");
  const [day, time] = order.receivingAt.split("T");
  const now = Date.now();
  const local = shopDateTime(now, timeZone);
  const date = day && day !== local.date && formatShopDay(day, timeZone, now, true);
  const overdue = !!action && order.receivingAt && order.receivingAt < `${local.date}T${local.time}`;
  return (
    <Card className="relative">
      <button
        type="button"
        onClick={open}
        aria-label={`Открыть заказ №${order.number}`}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-md text-left after:absolute after:inset-0 after:rounded-xl"
      >
        <span className="min-w-0">
          <span className="block text-title-3">№{order.number}</span>
          <span className="block truncate text-meta text-muted-foreground">{order.name ?? "Имя не указано"}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2 whitespace-nowrap text-price">
          {formatMinor(order.totalMinor, order.currency)}
          <ChevronRight aria-hidden="true" size={18} className="text-muted-foreground" />
        </span>
      </button>
      <div className="flex items-center gap-3 rounded-lg bg-secondary px-3 py-2.5">
        <Receiving aria-hidden="true" size={22} className="shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="text-price tabular-nums">{time === "23:59" || !time ? "Время согласуем" : time}</p>
          <p className="text-small text-muted-foreground">
            {methodLabel[order.method]}
            {date && ` · ${date}`}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <StagePill stage={order.stage} method={order.method} />
        <PaymentPill
          status={order.paymentStatus}
          stage={order.stage}
          debt={order.debtMinor}
          refund={order.refundMinor}
          currency={order.currency}
        />
        {overdue && <StatusPill tone="danger">Просрочен</StatusPill>}
      </div>
      <StageProgress stage={order.stage} method={order.method} compact />
      <div className="flex flex-wrap items-center justify-between gap-2 text-meta text-muted-foreground">
        <span>
          Собрано {order.packed} из {order.lines}
        </span>
        {action && (
          <Button variant="soft" className="relative z-10" loading={pending} onClick={next}>
            {order.stage === "accepted" ? "Открыть сборку" : action.action === "markPickedUp" ? "Выдать" : action.label}
          </Button>
        )}
      </div>
    </Card>
  );
}
