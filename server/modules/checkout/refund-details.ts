import type { z } from "zod";
import type { submitRefundDetails } from "../../../src/shared/contracts/order-refund";
import { ApiError } from "../../../src/shared/errors";
import type { CommandIdentity } from "../../middleware/idempotency";
import { executeCommand } from "../../shop/commands";
import type { ShopEnv } from "../../shop/env";
import { mediaPrefix } from "../media/objects";
import { buyerOrder, buyerOrderRow, unpackOrder } from "./buyer-orders";
import { openOrderRefund } from "./order-refund";
import { orderFinance, orderWorkflow } from "./order-workflow";

type Shop = ShopEnv["Bindings"];
export function saveRefundDetails(
  env: Shop,
  owner: string,
  number: number,
  input: z.infer<typeof submitRefundDetails>,
  identity: CommandIdentity,
) {
  const { storage } = env;
  return executeCommand(storage, env.db, `refund-details:${owner}:${number}`, identity, () => {
    const row = buyerOrderRow(storage, owner, number);
    if (row.version !== input.expectedVersion) throw new ApiError("VERSION_CONFLICT", "Заказ изменился");
    const work = orderWorkflow(row);
    const snapshot = unpackOrder(row);
    const finance = orderFinance(work, snapshot, row.payment_status);
    const refund = openOrderRefund(finance, number, snapshot.totalMinor, row.status);
    if (!refund || refund.id !== input.refundId || refund.details)
      throw new ApiError("INVALID_TRANSITION", "Реквизиты уже переданы или возврат закрыт");
    const now = Date.now();
    if (
      input.mediaId &&
      !storage.sql.exec(
        `UPDATE media SET status='attached',expires_at=NULL WHERE id=? AND owner=? AND purpose='refund'
        AND status='temp' AND ready=1 AND mime='image/webp' AND expires_at>?`,
        input.mediaId,
        owner,
        now,
      ).rowsWritten
    )
      throw new ApiError("VALIDATION", "QR недоступен. Прикрепите файл повторно");
    const fulfillment_state = JSON.stringify({
      ...work,
      finance: {
        ...finance,
        refund: {
          ...finance.refund,
          id: refund.id,
          details: { text: input.text, mediaId: input.mediaId },
          detailsAt: now,
        },
      },
    });
    storage.sql.exec(
      "UPDATE orders SET version=version+1,fulfillment_state=? WHERE number=?",
      fulfillment_state,
      number,
    );
    storage.sql.exec(
      "INSERT INTO buyer_order_events(order_number,actor,event,created_at) VALUES(?,?,'order.refundDetails',?)",
      number,
      owner,
      now,
    );
    env.changes.order(number);
    return { status: 200, body: buyerOrder({ ...row, fulfillment_state, version: row.version + 1 }) };
  }).body;
}

export async function refundImage(env: Shop, number: number, id: string, owner?: string) {
  const attached = env.storage.sql
    .exec(
      `SELECT 1 FROM orders o JOIN media m ON m.owner=o.customer
      WHERE o.number=? AND (? IS NULL OR o.customer=?) AND m.id=?
      AND m.id=json_extract(o.fulfillment_state, '$.finance.refund.details.mediaId')
      AND m.purpose='refund' AND m.status='attached' AND m.ready=1 AND m.mime='image/webp'`,
      number,
      owner ?? null,
      owner ?? null,
      id,
    )
    .toArray().length;
  if (!attached) throw new ApiError("NOT_FOUND", "Файл недоступен");
  const image = await env.media.MEDIA.get(`${mediaPrefix(env.shop.id, id)}original.webp`);
  if (!image) throw new ApiError("NOT_FOUND", "Файл недоступен");
  return new Response(image.body, {
    headers: {
      "Content-Type": "image/webp",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
