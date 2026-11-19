import type {
  BuyerOrder,
  BuyerOrdersPage,
  OrderStage,
  OrderSummary,
  PaymentState,
} from "../../../src/shared/contracts/buyer-order";
import type { OrderSnapshot } from "../../../src/shared/contracts/checkout";
import type { TimeChoice } from "../../../src/shared/contracts/receiving-time";
import { ApiError } from "../../../src/shared/errors";
import { revisionResponse } from "../../revisions";

type OrderRow = {
  number: number;
  created_at: number;
  status: OrderStage;
  payment_status: PaymentState;
  version: number;
  proof_media_id: string | null;
  snapshot: string;
};

export function isActiveOrder(stage: OrderStage) {
  return stage !== "completed" && stage !== "cancelled";
}

export function buyerOrderRow(storage: DurableObjectStorage, customer: string, number: number) {
  const [row] = storage.sql
    .exec<OrderRow>(
      "SELECT number,created_at,status,payment_status,version,proof_media_id,snapshot FROM orders WHERE customer=? AND number=?",
      customer,
      number,
    )
    .toArray();
  if (!row) throw new ApiError("NOT_FOUND", "Заказ недоступен");
  return row;
}

export function unpackOrder(row: OrderRow) {
  return JSON.parse(row.snapshot) as OrderSnapshot & { seatReserved?: boolean; reservedStock?: string[] };
}

export function buyerOrder(row: OrderRow): BuyerOrder {
  const { seatReserved: _seat, reservedStock: _stock, ...snapshot } = unpackOrder(row);
  return {
    ...snapshot,
    number: row.number,
    createdAt: row.created_at,
    stage: row.status,
    version: row.version,
    paymentStatus: row.payment_status,
    canCancel: isActiveOrder(row.status) && row.status !== "handed",
    canReplaceProof: row.status !== "cancelled" && row.payment_status === "pending_review",
    ...(row.status === "cancelled" && row.payment_status === "confirmed" ? { refundMinor: snapshot.totalMinor } : {}),
  };
}

type SummaryRow = {
  number: number;
  created_at: number;
  status: OrderStage;
  time: string | null;
  total: number;
  currency: string;
};
const toTime = (value: string | null) => (value ? (JSON.parse(value) as TimeChoice) : null);
const scope = {
  active: "status IN ('placed','accepted','handed','ready')",
  completed: "status IN ('completed','cancelled')",
};

export function activeBuyerOrders(storage: DurableObjectStorage, customer: string, request: Request) {
  const { latest, changes } = storage.sql
    .exec<{ latest: number | null; changes: number | null }>(
      `SELECT (SELECT number FROM orders WHERE customer=? ORDER BY number DESC LIMIT 1) AS latest,
      (SELECT revision FROM buyer_order_revisions WHERE customer=?) AS changes`,
      customer,
      customer,
    )
    .one();
  const revision = `${latest ?? 0}.${changes ?? 0}`;
  return revisionResponse(request, revision, () => {
    const rows = storage.sql
      .exec<Pick<SummaryRow, "number" | "status" | "time">>(
        `SELECT number,status,json_extract(snapshot,'$.time') AS time
       FROM orders WHERE customer=? AND ${scope.active} ORDER BY number DESC`,
        customer,
      )
      .toArray();
    return {
      count: rows.length,
      orders: rows.map((row) => ({ number: row.number, stage: row.status, time: toTime(row.time) })),
    };
  });
}

export function buyerOrdersPage(
  storage: DurableObjectStorage,
  customer: string,
  tab: keyof typeof scope,
  cursor?: string,
): BuyerOrdersPage {
  const match = cursor?.match(/^(active|completed)\.(\d+)$/u);
  if (cursor && (match?.[1] !== tab || !Number.isSafeInteger(Number(match[2]))))
    throw new ApiError("VALIDATION", "Страница заказов недоступна");
  const before = match ? Number(match[2]) : null;
  if (
    before !== null &&
    !storage.sql
      .exec(`SELECT number FROM orders WHERE customer=? AND number=? AND ${scope[tab]}`, customer, before)
      .toArray().length
  )
    throw new ApiError("VALIDATION", "Страница заказов недоступна");
  const rows = storage.sql
    .exec<SummaryRow>(
      `SELECT number,created_at,status,json_extract(snapshot,'$.time') AS time,
     json_extract(snapshot,'$.totalMinor') AS total,json_extract(snapshot,'$.currency') AS currency
     FROM orders WHERE customer=? AND ${scope[tab]} ${before === null ? "" : "AND number < ?"}
     ORDER BY number DESC LIMIT 21`,
      customer,
      ...(before === null ? [] : [before]),
    )
    .toArray();
  const orders: OrderSummary[] = rows.slice(0, 20).map((row) => ({
    number: row.number,
    createdAt: row.created_at,
    stage: row.status,
    time: toTime(row.time),
    totalMinor: row.total,
    currency: row.currency,
  }));
  return { orders, ...(rows.length > 20 ? { cursor: `${tab}.${orders[19].number}` } : {}) };
}
