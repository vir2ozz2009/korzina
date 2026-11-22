import { Bell, Bike, Check, Package, Store, X } from "lucide-react";
import type { OrderStage, PaymentState } from "../../../../shared/contracts/buyer-order";
import { formatMinor } from "../../../../shared/money";
import { StatusPill } from "../../../../ui/StatusPill";

export const methodLabel = { delivery: "Доставка", pickup: "Самовывоз" } as const;
export const stages = {
  placed: { label: "Новый", section: "Новые", Icon: Bell },
  accepted: { label: "Собирается", section: "Собираются", Icon: Package },
  ready: { label: "Ждёт выдачи", section: "Ждут выдачи", Icon: Store },
  handed: { label: "У курьера", section: "У курьера", Icon: Bike },
  completed: { label: "Выдан", section: "", Icon: Check },
  cancelled: { label: "Отменён", section: "", Icon: X },
} as const;

export function stageLabel(stage: OrderStage, method: keyof typeof methodLabel) {
  if (method === "delivery" && stage === "ready") return "Ждёт курьера";
  if (method === "delivery" && stage === "completed") return "Доставлен";
  return stages[stage].label;
}
const path = {
  pickup: ["placed", "accepted", "ready", "completed"],
  delivery: ["placed", "accepted", "ready", "handed", "completed"],
} satisfies Record<keyof typeof methodLabel, OrderStage[]>;

export function StagePill({ stage, method }: { stage: OrderStage; method: keyof typeof methodLabel }) {
  const Icon = stages[stage].Icon;
  return (
    <StatusPill tone="primary">
      <span className="inline-flex items-center gap-1">
        <Icon aria-hidden="true" size={14} />
        {stageLabel(stage, method)}
      </span>
    </StatusPill>
  );
}

export function PaymentPill({
  status,
  stage,
  debt,
  refund,
  currency,
}: {
  status: PaymentState;
  stage: OrderStage;
  debt?: number;
  refund?: number;
  currency?: string;
}) {
  if (refund && currency)
    return (
      <StatusPill tone="warning">
        {stage === "cancelled" ? "Вернуть" : "Клиент переплатил"} {formatMinor(refund, currency)}
      </StatusPill>
    );
  if (debt && currency) return <StatusPill tone="danger">Долг клиента {formatMinor(debt, currency)}</StatusPill>;
  if (status === "confirmed") return <StatusPill tone="success">Оплачен</StatusPill>;
  return <StatusPill tone="warning">{status === "pending_review" ? "Чек на проверке" : "Не оплачен"}</StatusPill>;
}

export function StageProgress({
  stage,
  method,
  compact = false,
}: {
  stage: OrderStage;
  method: keyof typeof methodLabel;
  compact?: boolean;
}) {
  const steps: OrderStage[] = path[method];
  const progress = steps.indexOf(stage) + 1;
  return (
    <div title={stageLabel(stage, method)} className="flex gap-1.5">
      {steps.map((step, index) => {
        const Icon = stages[step].Icon;
        return (
          <div key={step} className="min-w-0 flex-1">
            <div className={`h-1.5 rounded-pill ${index < progress ? "bg-primary" : "bg-secondary"}`} />
            {!compact && (
              <span className="mt-2 flex items-center gap-1 text-muted-foreground" title={stageLabel(step, method)}>
                <Icon size={17} aria-hidden="true" />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
