import type { OrderStage } from "../../../src/shared/contracts/buyer-order";
import { orderBalance, orderFinance } from "../checkout/order-workflow";
import type { ChangeState } from "./state";

export function writeOrderChange(
  storage: DurableObjectStorage,
  state: ChangeState,
  actor: string,
  event: string,
  details: unknown,
  now: number,
  stage: OrderStage = state.row.status,
) {
  const { row, snapshot, work } = state;
  const finance = orderFinance(work, snapshot, row.payment_status);
  const { debtMinor, refundMinor } = orderBalance(finance, snapshot.totalMinor, stage);
  row.snapshot = JSON.stringify(snapshot);
  row.fulfillment_state = JSON.stringify({ ...work, finance, debtMinor, refundMinor });
  row.status = stage;
  row.version += 1;
  storage.sql.exec(
    "UPDATE orders SET status=?,version=?,snapshot=?,fulfillment_state=? WHERE number=?",
    stage,
    row.version,
    row.snapshot,
    row.fulfillment_state,
    row.number,
  );
  return storage.sql
    .exec<{ id: number }>(
      "INSERT INTO buyer_order_events(order_number,actor,event,created_at,details) VALUES(?,?,?,?,?) RETURNING id",
      row.number,
      actor,
      event,
      now,
      JSON.stringify(details),
    )
    .one().id;
}

export function queueBuyerChange(
  storage: DurableObjectStorage,
  { row, snapshot }: ChangeState,
  eventId: number,
  kind: string,
  now: number,
) {
  const telegramId = snapshot.telegramLinked && /^telegram:(\d+)$/u.exec(row.customer)?.[1];
  if (!telegramId) return;
  storage.sql.exec(
    "INSERT INTO order_notification_outbox(event_key,kind,order_number,recipient,amount,currency,due_at) VALUES(?,?,?,?,?,?,?)",
    `change:${eventId}`,
    kind,
    row.number,
    telegramId,
    0,
    snapshot.currency,
    now,
  );
}
