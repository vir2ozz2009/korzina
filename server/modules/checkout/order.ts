import type {
  CheckoutCommand,
  OrderResult,
  OrderSnapshot,
  PaymentSettings,
} from "../../../src/shared/contracts/checkout";
import { ApiError } from "../../../src/shared/errors";
import type { CommandIdentity } from "../../middleware/idempotency";
import { executeCommand } from "../../shop/commands";
import { acceptsCheckout, type ShopEnv } from "../../shop/env";
import { removeOrderedLines } from "../cart/service";
import { reserveTime } from "../fulfillment/availability";
import type { ReservedOrder } from "./order-reservation";
import { paymentOptions, selectedPayment } from "./payment-settings";
import { loadQuote, purchaseDraft } from "./quote";
import { quoteTerms } from "./quote-terms";

type Shop = ShopEnv["Bindings"];
type Actor = { subject: string; kind: "guest" | "telegram" };
const receiptUnavailable = () => new ApiError("VALIDATION", "Чек недоступен. Прикрепите файл повторно.");

export function bindReceipt(storage: DurableObjectStorage, subject: string, mediaId: string, quoteId: string) {
  const now = Date.now();
  const quote = loadQuote(storage, subject, quoteId, now);
  if (!paymentOptions(quote.paymentSettings).some((option) => option.enabled && option.requiresReceipt))
    throw new ApiError("PAYMENT_METHOD_UNAVAILABLE", "Перевод недоступен");
  const row = storage.sql
    .exec<{ expires_at: number }>(
      "SELECT expires_at FROM media WHERE id=? AND owner=? AND purpose='receipt' AND status='temp' AND ready=1 AND expires_at>?",
      mediaId,
      subject,
      now,
    )
    .toArray()[0];
  if (!row) throw receiptUnavailable();
  storage.sql.exec(
    `INSERT INTO checkout_receipts(media_id,customer,quoted_total_minor,payment_settings,expires_at)
     VALUES(?,?,?,?,?) ON CONFLICT(media_id) DO NOTHING`,
    mediaId,
    subject,
    quote.totalMinor,
    JSON.stringify(quote.paymentSettings),
    row.expires_at,
  );
}

function confirmReceipt(
  storage: DurableObjectStorage,
  subject: string,
  mediaId: string,
  total: number,
  current: NonNullable<OrderSnapshot["paymentOption"]>,
  now: number,
) {
  const captured = storage.sql
    .exec<{ quoted_total_minor: number; payment_settings: string }>(
      "SELECT quoted_total_minor,payment_settings FROM checkout_receipts WHERE media_id=? AND customer=? AND expires_at>?",
      mediaId,
      subject,
      now,
    )
    .toArray()[0];
  if (!captured) throw receiptUnavailable();
  const update = storage.sql.exec(
    "UPDATE media SET status='attached',expires_at=NULL WHERE id=? AND owner=? AND purpose='receipt' AND status='temp' AND ready=1 AND expires_at>?",
    mediaId,
    subject,
    now,
  );
  if (!update.rowsWritten) throw receiptUnavailable();
  const previous = selectedPayment(JSON.parse(captured.payment_settings) as PaymentSettings, "transfer", current.id);
  const priorTotalMinor = captured.quoted_total_minor;
  return {
    priorTotalMinor,
    differenceMinor: total - priorTotalMinor,
    credentialsChanged:
      previous?.instruction !== current.instruction ||
      previous?.imageSrc !== current.imageSrc ||
      previous?.details !== current.details,
  };
}

export function placeOrder(env: Shop, actor: Actor, input: CheckoutCommand, command: CommandIdentity) {
  const { storage } = env;
  const subject = actor.subject;
  const now = Date.now();
  return executeCommand(storage, env.db, `checkout:${subject}`, command, () => {
    if (!acceptsCheckout(env)) throw new ApiError("SHOP_CLOSED", "Магазин временно не принимает заказы");
    const previous = loadQuote(storage, subject, input.quoteRevision, now);
    const { snapshot, cart, storedReceiving, customerName } = purchaseDraft(env, subject, actor.kind, now, false);
    const method = selectedPayment(
      snapshot.paymentSettings,
      input.payment,
      input.payment === "transfer" ? input.methodId : undefined,
    );
    if (!method) throw new ApiError("PAYMENT_METHOD_UNAVAILABLE", "Этот способ оплаты недоступен");
    if (JSON.stringify(quoteTerms(previous)) !== JSON.stringify(quoteTerms(snapshot)))
      throw new ApiError("QUOTE_CHANGED", "Условия заказа изменились", {
        beforeMinor: previous.totalMinor,
        afterMinor: snapshot.totalMinor,
      });
    const seatReserved = reserveTime(storage, snapshot.receiving.mode, snapshot.time, now);
    const { paymentSettings, ...details } = snapshot;
    const proof = input.payment === "transfer" ? (input.proofMediaId ?? null) : null;
    if (method.requiresReceipt && !proof) throw receiptUnavailable();
    const transferReview = proof ? confirmReceipt(storage, subject, proof, details.totalMinor, method, now) : undefined;
    const paymentStatus = proof ? "pending_review" : "unpaid";
    const order: OrderSnapshot = {
      ...details,
      payment: input.payment,
      paymentStatus,
      transferReview,
      ...(paymentSettings.options && { paymentOption: method }),
      ...(customerName && { customerName }),
    };
    const stock = order.lines.map(({ variantId, quantity }) => ({ variantId, quantity }));
    const reservedStock = cart.lines
      .filter(({ available, stock }) => available && stock !== null)
      .map(({ variantId }) => variantId);
    storage.sql.exec(
      `WITH ordered AS (
         SELECT json_extract(value,'$.variantId') AS id, json_extract(value,'$.quantity') AS quantity FROM json_each(?)
       )
       UPDATE variants SET stock=stock-ordered.quantity, stock_revision=stock_revision+1, purchased=purchased+ordered.quantity FROM ordered
       WHERE variants.id=ordered.id AND variants.stock IS NOT NULL`,
      JSON.stringify(stock),
    );
    const { number } = storage.sql
      .exec<{ number: number }>(
        "INSERT INTO orders(customer,created_at,status,payment_status,proof_media_id,snapshot) VALUES(?,?,'placed',?,?,?) RETURNING number",
        subject,
        now,
        paymentStatus,
        proof,
        JSON.stringify({
          ...order,
          seatReserved,
          reservedStock,
          customerNameKey: customerName?.toLocaleLowerCase("ru"),
        }),
      )
      .one();
    storage.sql.exec("INSERT INTO order_outbox(order_number,event,created_at) VALUES(?,'order.placed',?)", number, now);
    removeOrderedLines(storage, subject, cart, storedReceiving);
    const body: OrderResult = { ...order, number };
    return { status: 201, body };
  });
}

export function readOrder(storage: DurableObjectStorage, subject: string, number: number): OrderResult {
  const row = storage.sql
    .exec<{ snapshot: string }>("SELECT snapshot FROM orders WHERE customer=? AND number=?", subject, number)
    .toArray()[0];
  if (!row) throw new ApiError("NOT_FOUND", "Заказ недоступен");
  const {
    seatReserved: _seat,
    reservedStock: _stock,
    customerNameKey: _nameKey,
    ...order
  } = JSON.parse(row.snapshot) as ReservedOrder;
  return { ...order, number };
}
