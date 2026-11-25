import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { QueryBoundary } from "../../../../app/shell/QueryBoundary";
import { useToast } from "../../../../app/shell/ToastProvider";
import type { SellerOrder, SellerOrderCommand } from "../../../../shared/contracts/seller-order";
import { HttpError } from "../../../../shared/http-error";
import { Button } from "../../../../ui/Button";
import { EmptyState } from "../../../../ui/EmptyState";
import { Sheet } from "../../../../ui/Sheet";
import { SellerChangeSummary, SellerComposition } from "../../../order-changes";
import { useSellerOrder, useSellerOrderCommand } from "../../orders-api";
import { OrderDetails } from "./OrderDetails";
import { OrderHistory } from "./OrderHistory";
import { OrderNextFooter } from "./OrderNextFooter";
import { OrderPaymentSheet, type PaymentSheetAction } from "./OrderPaymentSheet";
import { OrderStageSheet, type StageSheetAction } from "./OrderStageSheet";
import { isHandoff, mainAction, type OrderAction, rollbackStage } from "./order-actions";
import { SellerOrdersShell } from "./SellerOrdersShell";
import { SellerReceivingActions } from "./SellerReceivingActions";
import { SellerRefundSheet } from "./SellerRefundSheet";

type Entry = "next" | "packing" | "payment" | "receipt";

export function SellerOrderScreen() {
  const location = useRouterState({ select: (state) => state.location });
  const number = Number(location.pathname.split("/").at(-1));
  return (
    <SellerOrdersShell title={Number.isSafeInteger(number) && number > 0 ? `Заказ №${number}` : "Заказ"}>
      {(store) => (
        <OrderQuery key={`${store}:${number}`} store={store} number={number} entry={location.search.action} />
      )}
    </SellerOrdersShell>
  );
}

function OrderQuery({ store, number, entry }: { store: string; number: number; entry?: Entry }) {
  const query = useSellerOrder(store, number);
  const navigate = useNavigate();
  if (!Number.isSafeInteger(number) || number < 1 || (query.error instanceof HttpError && query.error.status === 404))
    return (
      <EmptyState
        title="Заказ недоступен"
        action="К заказам"
        onAction={() =>
          void navigate({
            to: "/seller/orders",
            search: (previous) => ({ shop: previous.shop, store }),
          })
        }
      />
    );
  return (
    <QueryBoundary query={query} template="order">
      {(order) => <OrderView store={store} order={order} entry={entry} />}
    </QueryBoundary>
  );
}

function OrderView({ store, order, entry }: { store: string; order: SellerOrder; entry?: Entry }) {
  const [draft, setDraft] = useState(false);
  const toast = useToast();
  const replacementPending = !!order.composition?.expiresAt;
  const next = mainAction(order.stage, order.receiving.mode === "delivery");
  const review = order.paymentStatus === "pending_review" || order.topUp?.status === "pending_review";
  const [sheet, setSheet] = useState<OrderAction | "more" | undefined>(() =>
    entry === "receipt" && review && order.permissions.payments
      ? "confirmTransfer"
      : !replacementPending &&
          entry === "next" &&
          next &&
          isHandoff(next.action) &&
          (order.balance.outstandingMinor === 0 || order.permissions.payments)
        ? next.action
        : undefined,
  );
  const focusDone = useRef(false);
  useEffect(() => {
    if ((entry !== "packing" && entry !== "payment") || focusDone.current) return;
    const frame = requestAnimationFrame(() => {
      const heading = document.getElementById(entry === "packing" ? "order-packing" : "order-payment");
      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView({ block: "start" });
      focusDone.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [entry]);

  const mutation = useSellerOrderCommand(store);
  const attempt = useRef<{ body: string; key: string } | undefined>(undefined);
  function submit(command: SellerOrderCommand) {
    if (mutation.isPending) return;
    const body = JSON.stringify(command);
    const current = attempt.current?.body === body ? attempt.current : { body, key: crypto.randomUUID() };
    attempt.current = current;
    mutation.mutate(
      { command, number: order.number, key: current.key },
      {
        onSuccess: () => {
          attempt.current = undefined;
          setSheet(undefined);
        },
      },
    );
  }
  const pending = mutation.isPending;
  const error = mutation.error?.message;
  const close = () => {
    setSheet(undefined);
    mutation.reset();
  };
  function action(action: OrderAction) {
    if (isHandoff(action) && replacementPending) {
      toast("Сначала дождитесь ответа по замене");
      return;
    }
    mutation.reset();
    if (action === "accept" || (action === "markReady" && order.packed.length === order.lines.length)) {
      submit({ action, expectedRevision: order.revision });
    } else if (action === "setAllPacked") {
      submit({ action, packed: true, expectedRevision: order.revision });
    } else {
      setSheet(action);
    }
  }

  const payment =
    !!sheet &&
    (sheet === "recordPayment" ||
      sheet === "correctPayment" ||
      sheet === "confirmTransfer" ||
      sheet === "setDeliveryFee" ||
      (sheet !== "more" && isHandoff(sheet) && order.balance.outstandingMinor > 0));
  const allowedNext = !next || !isHandoff(next.action) || !order.balance.outstandingMinor || order.permissions.payments;
  return (
    <>
      {order.composition && <SellerChangeSummary change={order.composition} timeZone={order.timeZone} />}
      <SellerReceivingActions order={order} store={store} />
      <OrderDetails
        order={order}
        store={store}
        pending={pending}
        action={action}
        composition={
          <SellerComposition
            store={store}
            order={order}
            pending={pending}
            pack={(line, packed) => submit({ action: "setLinePacked", line, packed, expectedRevision: order.revision })}
            packAll={() => action("setAllPacked")}
            cancel={() => action("cancel")}
            onDraft={setDraft}
          />
        }
      />
      <OrderHistory order={order} />
      {entry === "receipt" && !review && <p role="status">Задача уже закрыта</p>}
      {!sheet && error && <p role="alert">{error}</p>}
      {!allowedNext && <p className="text-meta text-muted-foreground">Для завершения шага нужно право на оплату.</p>}
      {!draft && (
        <OrderNextFooter
          order={order}
          next={next}
          pending={pending}
          allowed={allowedNext}
          replacementPending={replacementPending}
          action={action}
        />
      )}
      <div className="pb-16">
        {order.stage !== "cancelled" && (
          <Button full variant="secondary" disabled={pending} onClick={() => setSheet("more")}>
            Ещё
          </Button>
        )}
      </div>
      {sheet === "more" ? (
        <Sheet
          open
          title="Ещё"
          onOpenChange={(open) => {
            if (!open) close();
          }}
        >
          <div className="grid gap-2">
            {rollbackStage(order.stage, order.receiving.mode === "delivery") && (
              <Button full variant="secondary" onClick={() => action("rollback")}>
                Вернуть статус
              </Button>
            )}
            <Button full variant="secondary" onClick={() => action("cancel")}>
              Отменить заказ
            </Button>
          </div>
        </Sheet>
      ) : sheet === "markRefundReturned" || sheet === "openRefund" ? (
        <SellerRefundSheet
          key={sheet}
          order={order}
          openRefund={sheet === "openRefund"}
          error={error}
          pending={pending}
          close={close}
          submit={submit}
        />
      ) : payment ? (
        <OrderPaymentSheet
          key={sheet}
          action={sheet as PaymentSheetAction}
          store={store}
          order={order}
          error={error}
          pending={pending}
          submit={submit}
          close={close}
        />
      ) : (
        sheet && (
          <OrderStageSheet
            key={sheet}
            action={sheet as StageSheetAction}
            order={order}
            error={error}
            pending={pending}
            submit={submit}
            close={close}
          />
        )
      )}
    </>
  );
}
