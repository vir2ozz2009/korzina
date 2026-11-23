import { useNavigate } from "@tanstack/react-router";
import { CalendarDays, MessageCircle } from "lucide-react";
import type { SellerOrder } from "../../../../shared/contracts/seller-order";
import { formatReceivingTime } from "../../../../shared/datetime";
import { Button } from "../../../../ui/Button";
import { Card } from "../../../../ui/Card";
import { ListItem } from "../../../../ui/ListItem";
import { TimeControls } from "../../../order-changes";

export function SellerReceivingActions({ order, store }: { order: SellerOrder; store: string }) {
  const navigate = useNavigate();
  return (
    <Card>
      <ListItem
        variant="compact"
        title="Время получения"
        subtitle={order.time ? formatReceivingTime(order.time, order.timeZone) : "Время согласуем"}
        icon={<CalendarDays size={21} aria-hidden />}
      />
      <p className="px-2 text-small text-muted-foreground">Часовой пояс магазина · {order.timeZone}</p>
      <TimeControls
        number={order.number}
        revision={order.revision}
        time={order.time}
        timeZone={order.timeZone}
        change={order.timeChange}
        store={store}
        editable={!order.handedOff && order.stage !== "cancelled"}
        compositionPending={!!order.composition?.expiresAt}
      />
      {order.permissions.chat && (
        <Button
          full
          variant="secondary"
          icon={<MessageCircle size={19} aria-hidden />}
          onClick={() =>
            void navigate({
              to: "/seller/orders/$number/chat",
              params: { number: String(order.number) },
              search: { store },
            })
          }
        >
          Чат по заказу
        </Button>
      )}
    </Card>
  );
}
