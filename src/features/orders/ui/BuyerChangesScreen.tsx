import { useNavigate, useParams } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { Header } from "../../../app/shell/Header";
import { QueryBoundary } from "../../../app/shell/QueryBoundary";
import { Screen } from "../../../app/shell/Screen";
import type { BuyerOrder } from "../../../shared/contracts/buyer-order";
import type { CompositionAnswer, CompositionLine, OrderLine } from "../../../shared/contracts/order-changes";
import { shopDateTime } from "../../../shared/datetime";
import { HttpError } from "../../../shared/http-error";
import { formatMinor } from "../../../shared/money";
import { buyerOrderSearch, shopTimeZone } from "../../../shared/shop-api";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { EmptyState } from "../../../ui/EmptyState";
import { ProductImage } from "../../../ui/ProductImage";
import { imageSource } from "../../../ui/product-image";
import { StickyFooter } from "../../../ui/StickyFooter";
import { ChangeAmount, ChangeTotals, useAnswerComposition } from "../../order-changes";
import { useBuyerOrder } from "../api";
import { TopUpSheet } from "./TopUpSheet";

export function BuyerChangesScreen() {
  const { number } = useParams({ from: "/orders/$number/changes" });
  const order = useBuyerOrder(Number(number));
  return (
    <Screen template="order" header={<Header title="В заказе изменения" />}>
      <QueryBoundary query={order} template="order">
        {(value) => <BuyerChanges order={value} />}
      </QueryBoundary>
    </Screen>
  );
}

function BuyerChanges({ order }: { order: BuyerOrder }) {
  const navigate = useNavigate();
  const change = order.composition;
  const mutation = useAnswerComposition(order.number);
  const [topUp, setTopUp] = useState(false);
  const [confirm, setConfirm] = useState<{ lineId: string; total: number }>();
  const back = () =>
    void navigate({ to: "/orders/$number", params: { number: String(order.number) }, search: buyerOrderSearch });
  if (!change) return <EmptyState title="Изменений пока нет" action="К заказу" onAction={back} />;
  const respond = (line: CompositionLine, decision: CompositionAnswer["decision"]) => {
    mutation.mutate(
      {
        changeId: change.id,
        expectedVersion: order.version,
        lineId: line.id,
        decision,
        ...(decision === "accept" && confirm?.lineId === line.id ? { confirmedLineMinor: confirm.total } : {}),
      },
      {
        onSuccess: () => setConfirm(undefined),
        onError: (error) => {
          if (error instanceof HttpError && error.code === "QUOTE_CHANGED") {
            const details = error.details as { line?: OrderLine } | undefined;
            if (details?.line) setConfirm({ lineId: line.id, total: details.line.totalMinor });
          }
        },
      },
    );
  };
  return (
    <>
      <Card>
        <h2 className="text-title-3">{change.expiresAt ? "Магазин предлагает замену" : "Изменения заказа"}</h2>
        {change.expiresAt && <p>Ответьте до {shopDateTime(change.expiresAt, shopTimeZone).time}</p>}
      </Card>
      {change.lines.map((line) => {
        const pending = line.status === "pending";
        return (
          <Card key={line.id}>
            {line.before && line.after && (line.kind === "replace" || line.kind === "add") ? (
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                <ChangeProduct line={line.before} currency={order.currency} before />
                <ArrowRight size={16} aria-hidden />
                <ChangeProduct line={line.after} currency={order.currency} />
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p>
                  {line.before?.name ?? line.after?.name} · {line.before?.unit ?? line.after?.unit}
                </p>
                <p className="text-small">
                  {line.kind === "decrease"
                    ? `Есть ${line.after?.quantity} из ${line.before?.quantity}`
                    : line.status === "closed"
                      ? "Предложение закрыто"
                      : "Нет в наличии — убрали"}
                </p>
              </div>
            )}
            <ChangeAmount delta={line.deltaMinor} currency={order.currency} pending={pending} />
            {pending && (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  full
                  loading={mutation.isPending && mutation.variables?.lineId === line.id}
                  disabled={mutation.isPending}
                  onClick={() => respond(line, "accept")}
                >
                  {confirm?.lineId === line.id
                    ? `Согласен · ${formatMinor(confirm.total, order.currency)}`
                    : "Согласен"}
                </Button>
                <Button full variant="secondary" disabled={mutation.isPending} onClick={() => respond(line, "decline")}>
                  Не нужно
                </Button>
              </div>
            )}
            {line.status === "expired" && <p role="status">Срок ответа истёк</p>}
          </Card>
        );
      })}
      {mutation.error && <p role="alert">{mutation.error.message}</p>}
      <Button className="mb-24" full variant="secondary" onClick={back}>
        К заказу
      </Button>
      <StickyFooter floating>
        <ChangeTotals totals={change.totals} onTopUp={() => setTopUp(true)} />
      </StickyFooter>
      {topUp && <TopUpSheet order={order} close={() => setTopUp(false)} />}
    </>
  );
}

function ChangeProduct({ line, currency, before }: { line: OrderLine; currency: string; before?: boolean }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className="grid min-w-0 gap-1 self-stretch rounded-lg border border-border p-2 text-left"
      onClick={() =>
        void navigate({
          to: "/p/$id",
          params: { id: line.productId },
          search: (previous) => ({ ...buyerOrderSearch(previous), variant: line.variantId }),
        })
      }
    >
      <span className="text-small">{before ? "Было" : "Предлагаем"}</span>
      <div className={before ? "opacity-55 grayscale" : undefined}>
        <ProductImage {...imageSource(line.image ?? undefined)} alt="" className="w-full" priority />
      </div>
      <span className={before ? "break-words text-label line-through" : "break-words text-label"}>{line.name}</span>
      <span className="text-small">
        {line.unit} · {line.quantity} шт
      </span>
      <span className="text-label">{formatMinor(line.totalMinor, currency)}</span>
      {before && <span className="text-small text-muted-foreground">Нет в наличии</span>}
    </button>
  );
}
