import type { ReactNode } from "react";
import { Card } from "./Card";
export function OrderStatusCard({
  number,
  time,
  stage,
  payment,
}: {
  number: string;
  time: string;
  stage: string;
  payment: ReactNode;
}) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-micro text-muted-foreground">Заказ {number}</p>
          <p className="text-title-2">{time}</p>
        </div>
        {payment}
      </div>
      <p className="text-label text-primary-strong">{stage}</p>
    </Card>
  );
}
