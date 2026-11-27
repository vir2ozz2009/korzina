import { addressKey, savedAddressLimit } from "../../../src/shared/address-key";
import { cartTotals } from "../../../src/shared/cart-totals";
import { ApiError } from "../../../src/shared/errors";
import type { CartSource } from "../cart/quote";
import { persistCart, readCartState } from "../cart/service";
import { readReceiving, writeReceiving } from "../fulfillment/service";

function mergeCartLines(storage: DurableObjectStorage, guest: string, account: string, source: CartSource) {
  const guestCart = readCartState(storage, guest, source).cart;
  const accountCart = readCartState(storage, account, source).cart;
  const lines = new Map(accountCart.lines.map((line) => [line.variantId, line]));
  for (const line of guestCart.lines) {
    const other = lines.get(line.variantId);
    if (!other || line.quantity > other.quantity) lines.set(line.variantId, line);
  }
  if (lines.size > 50) throw new ApiError("VALIDATION", "В объединённой корзине больше 50 фасовок");
  const revision = Math.max(guestCart.revision, accountCart.revision) + 1;
  const adjustments = new Map(accountCart.review?.changes.map((item) => [item.variantId, item]));
  for (const item of guestCart.review?.changes ?? []) {
    if (!adjustments.has(item.variantId)) adjustments.set(item.variantId, item);
  }
  const totals = cartTotals([...lines.values()]);
  const review = adjustments.size
    ? {
        beforeMinor: accountCart.review?.beforeMinor ?? guestCart.review?.beforeMinor ?? totals.totalMinor,
        changes: [...adjustments.values()],
      }
    : undefined;
  persistCart(storage, account, { revision, currency: accountCart.currency, ...totals, review });
  return revision;
}

function mergeReceiving(storage: DurableObjectStorage, guest: string, account: string, revision: number) {
  const from = readReceiving(storage, guest);
  const to = readReceiving(storage, account);
  const useGuest = from.explicitMode && (!to.explicitMode || from.receivingUpdatedAt > to.receivingUpdatedAt);
  const { revision: _revision, ...selection } = useGuest ? from : to;
  const seenAddresses = new Set<string>();
  const savedAddresses = [...to.savedAddresses, ...from.savedAddresses].filter((address) => {
    const key = addressKey(address);
    if (seenAddresses.has(key)) return false;
    seenAddresses.add(key);
    return true;
  });
  if (savedAddresses.length > savedAddressLimit)
    throw new ApiError(
      "ADDRESS_LIMIT",
      "При объединении получится больше 10 адресов. Удалите лишние адреса и повторите.",
    );
  const addressesChanged =
    savedAddresses.length !== to.savedAddresses.length ||
    savedAddresses.some((address, index) => address !== to.savedAddresses[index]);
  const other = useGuest ? to : from;
  writeReceiving(storage, account, revision, {
    ...selection,
    savedAddresses,
    addressesRevision: addressesChanged ? revision : to.addressesRevision,
    lastUsedAddress: selection.lastUsedAddress ?? to.lastUsedAddress ?? from.lastUsedAddress,
    deliveryDraft:
      selection.receiving?.mode === "pickup"
        ? (selection.deliveryDraft ?? (other.receiving?.mode === "delivery" ? other.receiving : other.deliveryDraft))
        : undefined,
  });
}

function mergeCart(storage: DurableObjectStorage, guest: string, account: string, catalog: CartSource) {
  const phones = storage.sql
    .exec<{ customer: string; phone: string | null }>(
      "SELECT customer,phone FROM carts WHERE customer IN (?,?)",
      guest,
      account,
    )
    .toArray();
  const from = phones.find(({ customer }) => customer === guest);
  if (!from) return;
  const revision = mergeCartLines(storage, guest, account, catalog);
  mergeReceiving(storage, guest, account, revision);
  storage.sql.exec(
    `UPDATE carts SET
    promo_alternative=CASE WHEN promo_code IS NOT NULL AND promo_code<>(SELECT promo_code FROM carts WHERE customer=?)
      THEN (SELECT promo_code FROM carts WHERE customer=?) ELSE promo_alternative END,
    promo_code=COALESCE(promo_code,(SELECT promo_code FROM carts WHERE customer=?)) WHERE customer=?`,
    guest,
    guest,
    guest,
    account,
  );
  const phone = phones.find(({ customer }) => customer === account)?.phone ?? from.phone;
  if (phone) storage.sql.exec("UPDATE carts SET phone=? WHERE customer=?", phone, account);
  storage.sql.exec("DELETE FROM carts WHERE customer=?", guest);
}

function mergeBuyerFavorites(storage: DurableObjectStorage, source: string, target: string) {
  storage.sql.exec(
    `INSERT INTO buyer_favorites(customer,product_id,added_at)
     SELECT ?,product_id,added_at FROM buyer_favorites WHERE customer=?
     ON CONFLICT(customer,product_id) DO UPDATE SET added_at=MAX(added_at,excluded.added_at)`,
    target,
    source,
  );
  storage.sql.exec("DELETE FROM buyer_favorites WHERE customer=?", source);
}

function transferOrdersAndReceipts(storage: DurableObjectStorage, from: string, to: string) {
  const result = storage.sql.exec("UPDATE orders SET customer=? WHERE customer=?", to, from);
  storage.sql.exec(
    `UPDATE promo_uses SET customer=?,purchase_number=CASE WHEN purchase_number IS NOT NULL AND EXISTS(
    SELECT 1 FROM promo_uses target WHERE target.customer=? AND target.purchase_number=promo_uses.purchase_number
    AND target.released_at IS NULL) THEN NULL ELSE purchase_number END WHERE customer=?`,
    to,
    to,
    from,
  );
  if (!result.rowsWritten) return;
  storage.sql.exec(
    `UPDATE media SET owner=?,request_key='order:'||id WHERE owner=? AND id IN (
       SELECT proof_media_id FROM orders WHERE customer=?
       UNION ALL SELECT h.media_id FROM order_receipt_history h JOIN orders o ON o.number=h.order_number WHERE o.customer=?
       UNION ALL SELECT json_extract(fulfillment_state,'$.topUp.proof') FROM orders WHERE customer=?
       UNION ALL SELECT json_extract(fulfillment_state,'$.finance.refund.details.mediaId') FROM orders WHERE customer=?
     )`,
    to,
    from,
    to,
    to,
    to,
    to,
  );
}

export const buyerMergeSteps = [
  { tables: ["carts"], run: mergeCart },
  { tables: ["buyer_favorites"], run: mergeBuyerFavorites },
  { tables: ["orders", "media", "order_receipt_history", "promo_uses"], run: transferOrdersAndReceipts },
] as const;

// The caller also revokes the guest session and completes sign-in in the same transaction.
export function mergeBuyer(storage: DurableObjectStorage, source: string, target: string, catalog: CartSource) {
  if (source === target) return;
  for (const { run } of buyerMergeSteps) run(storage, source, target, catalog);
}
