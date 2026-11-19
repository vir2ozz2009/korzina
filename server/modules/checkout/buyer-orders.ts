import { eq } from "drizzle-orm";
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
import { digest } from "../../auth/tokens";
import { revisionResponse } from "../../revisions";
import type { ShopEnv } from "../../shop/env";
import { sessions } from "../../shop/schema";
import { readCustomerWith } from "../auth/service";
import { buyerOrderRevisions } from "./schema";

type OrderRow = {
  number: number;
  created_at: number;
  status: OrderStage;
  payment_status: PaymentState;
  version: number;
  proof_media_id: string | null;
  snapshot: string;
};

function isActiveOrder(stage: OrderStage) {
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

export async function activeBuyerOrders({ db, storage, shop }: ShopEnv["Bindings"], request: Request) {
  const session = await readCustomerWith(request, shop.id, async (sessionId) => {
    // Scope cached badges to the session before reading the current revision.
    const cacheKey = await digest(`active-orders:${shop.id}:${sessionId}`);
    const row = db
      .select({
        subject: sessions.subject,
        kind: sessions.kind,
        expiresAt: sessions.expiresAt,
        revision: buyerOrderRevisions.revision,
      })
      .from(sessions)
      .leftJoin(buyerOrderRevisions, eq(sessions.subject, buyerOrderRevisions.customer))
      .where(eq(sessions.tokenHash, sessionId))
      .get();
    return row && { ...row, cacheKey: BigInt(`0x${cacheKey.slice(0, 16)}`) };
  });
  if (!session) throw new ApiError("UNAUTHORIZED", "Войдите в магазин");
  const revision = `1.${session.cacheKey}.${session.revision ?? 0}`;
  return revisionResponse(request, revision, () => {
    const rows = storage.sql
      .exec<Pick<SummaryRow, "number" | "status" | "time">>(
        `SELECT number,status,json_extract(snapshot,'$.time') AS time
       FROM orders WHERE customer=? AND ${scope.active} ORDER BY number DESC`,
        session.subject,
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

export function hasBuyerOrders(storage: DurableObjectStorage, subject: string) {
  return storage.sql.exec("SELECT 1 FROM orders WHERE customer=? LIMIT 1", subject).toArray().length > 0;
}
