import { ApiError } from "../../../src/shared/errors";
import type { ShopEnv } from "../../shop/env";
import { mediaPrefix } from "../media/objects";

export async function sellerReceipt(env: ShopEnv["Bindings"], number: number, id: string) {
  const receipt = env.storage.sql
    .exec<{ mime: string }>(
      `SELECT m.mime FROM media m JOIN orders o ON o.number=?
      WHERE m.id=? AND m.purpose='receipt' AND m.status='attached' AND m.ready=1
      AND (o.proof_media_id=m.id OR json_extract(o.fulfillment_state,'$.topUp.proof')=m.id OR EXISTS (
        SELECT 1 FROM order_receipt_history h WHERE h.order_number=o.number AND h.media_id=m.id
      ))`,
      number,
      id,
    )
    .toArray()[0];
  if (!receipt) throw new ApiError("NOT_FOUND", "Чек недоступен");
  const object = await env.media.MEDIA.get(
    mediaPrefix(env.shop.id, id) + (receipt.mime === "application/pdf" ? "original.pdf" : "original.webp"),
  );
  if (!object) throw new ApiError("NOT_FOUND", "Чек недоступен");
  return new Response(object.body, {
    headers: {
      "Content-Type": receipt.mime,
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
