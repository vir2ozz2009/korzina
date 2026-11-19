import { cartTotals } from "../../../src/shared/cart-totals";
import type { Cart, CartCommandInput } from "../../../src/shared/contracts/cart";
import { ApiError } from "../../../src/shared/errors";
import { addMinor, multiplyMinor } from "../../../src/shared/money";
import type { CommandIdentity } from "../../middleware/idempotency";
import { parseSelection, readReceiving, writeReceiving } from "../fulfillment/service";
import { type CartSource, reconcileQuote, type SavedQuote, savedQuote, toLine } from "./quote";

type CartState = {
  revision: number;
  currency: string;
  lines: string;
  quote: string | null;
  fingerprint: string | null;
  response: string | null;
};

const read = (
  storage: DurableObjectStorage,
  customer: string,
  source: CartSource,
  variantId = "",
  identity?: CommandIdentity,
) => {
  const row = storage.sql
    .exec<CartState>(
      `SELECT COALESCE(c.revision,0) AS revision,s.currency,c.quote,i.fingerprint,i.response,
      (SELECT json_group_array(json_object(
        'variantId',w.variant_id,'productId',p.id,'name',p.name,'unit',v.name,'quantity',w.quantity,
        'priceMinor',v.price_minor,'stock',v.stock,
        'available',COALESCE(v.visible AND v.product_available AND (v.stock IS NULL OR v.stock>0),0),
        'photo',CASE WHEN m.id IS NOT NULL THEN json_object('id',m.id,'edgeColor',m.edge_color,'cropPosition',json(m.crop_position)) END))
      FROM (SELECT json_extract(j.value,'$.variantId') AS variant_id,json_extract(j.value,'$.quantity') AS quantity
            FROM json_each(COALESCE(c.lines,'[]')) j
            UNION ALL SELECT ?,0 WHERE ? != '') w
      LEFT JOIN variants v ON v.id=w.variant_id LEFT JOIN products p ON p.id=v.product_id
      LEFT JOIN media m ON m.id=COALESCE(v.photo_id, (
        SELECT pp.media_id FROM product_photos pp WHERE pp.product_id=p.id ORDER BY pp.position LIMIT 1
      )) AND m.ready=1 AND m.status='attached') AS lines
      FROM catalog_state s LEFT JOIN carts c ON c.customer=?
      LEFT JOIN idempotency i ON i.scope=? AND i.key=? WHERE s.id=1`,
      variantId,
      variantId,
      customer,
      `cart:${customer}`,
      identity?.key ?? "",
    )
    .one();
  const saved = row.quote ? (JSON.parse(row.quote) as SavedQuote) : null;
  const prior = new Map(saved?.lines.map((line) => [line.variantId, line]));
  const rows = (JSON.parse(row.lines) as Parameters<typeof toLine>[0][]).map((line) =>
    toLine(line, source, prior.get(line.variantId)),
  );
  const current = reconcileQuote(
    row.revision,
    row.currency,
    rows.filter((line) => line.quantity > 0),
    saved,
  );
  return {
    ...current,
    initial: !saved && current.cart.lines.length > 0,
    offered: rows.find((line) => line.quantity === 0),
    previous: row.response,
    fingerprint: row.fingerprint,
  };
};

function persist(storage: DurableObjectStorage, customer: string, cart: Cart) {
  const lines = cart.lines.map(({ variantId, quantity }) => ({ variantId, quantity }));
  storage.sql.exec(
    `INSERT INTO carts(customer,revision,lines,quote,updated_at) VALUES(?,?,?,?,?)
     ON CONFLICT(customer) DO UPDATE SET revision=excluded.revision,lines=excluded.lines,quote=excluded.quote,updated_at=excluded.updated_at`,
    customer,
    cart.revision,
    JSON.stringify(lines),
    JSON.stringify(savedQuote(cart)),
    Date.now(),
  );
}

export function readCart(storage: DurableObjectStorage, customer: string, source: CartSource): Cart {
  return storage.transactionSync(() => {
    const { cart, changed, initial } = read(storage, customer, source);
    if (changed || initial) persist(storage, customer, cart);
    return cart;
  });
}

export function removeOrderedLines(
  storage: DurableObjectStorage,
  customer: string,
  cart: Cart,
  storedReceiving: string | null,
) {
  const selection = parseSelection(storedReceiving);
  const next = { ...selection, time: null };
  if (next.receiving) {
    const { comment: _comment, ...receiving } = next.receiving;
    next.receiving = receiving;
    if (receiving.mode === "delivery") next.lastUsedAddress = receiving;
  }
  const extras = cartTotals(cart.lines.filter((line) => !line.available));
  storage.sql.exec(
    "UPDATE carts SET revision=?,lines=?,quote=?,receiving=?,updated_at=? WHERE customer=?",
    cart.revision + 1,
    JSON.stringify(extras.lines.map(({ variantId, quantity }) => ({ variantId, quantity }))),
    JSON.stringify(savedQuote({ ...cart, ...extras, review: undefined })),
    JSON.stringify(next),
    Date.now(),
    customer,
  );
}

// Part of the transaction that attaches a verified Telegram session.
export function mergeCustomerCarts(storage: DurableObjectStorage, guest: string, account: string, source: CartSource) {
  const from = readReceiving(storage, guest);
  const to = readReceiving(storage, account);
  const phones = storage.sql
    .exec<{ customer: string; phone: string | null }>(
      "SELECT customer,phone FROM carts WHERE customer IN (?,?)",
      guest,
      account,
    )
    .toArray();
  if (!phones.some(({ customer }) => customer === guest)) return;
  const guestCart = read(storage, guest, source).cart;
  const accountCart = read(storage, account, source).cart;
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
  persist(storage, account, { revision, currency: accountCart.currency, ...totals, review });
  const { revision: _revision, ...selection } =
    from.receiving && (!to.receiving || from.receivingUpdatedAt > to.receivingUpdatedAt) ? from : to;
  const seenAddresses = new Set<string>();
  const savedAddresses = [...selection.savedAddresses, ...to.savedAddresses, ...from.savedAddresses]
    .filter(({ address, districtId }) => {
      const key = JSON.stringify([address.toLowerCase(), districtId]);
      if (seenAddresses.has(key)) return false;
      seenAddresses.add(key);
      return true;
    })
    .slice(0, 3);
  writeReceiving(storage, account, revision, {
    ...selection,
    savedAddresses,
    lastUsedAddress: selection.lastUsedAddress ?? to.lastUsedAddress ?? from.lastUsedAddress,
  });
  const phone =
    phones.find(({ customer }) => customer === account)?.phone ??
    phones.find(({ customer }) => customer === guest)?.phone;
  if (phone) storage.sql.exec("UPDATE carts SET phone=? WHERE customer=?", phone, account);
  storage.sql.exec("UPDATE orders SET customer=? WHERE customer=?", account, guest);
  storage.sql.exec(
    "UPDATE media SET owner=?,request_key='order:'||id WHERE owner=? AND id IN (SELECT proof_media_id FROM orders WHERE customer=?)",
    account,
    guest,
    account,
  );
  storage.sql.exec("DELETE FROM carts WHERE customer=?", guest);
}

export function changeCart(
  storage: DurableObjectStorage,
  customer: string,
  source: CartSource,
  input: CartCommandInput,
  identity: CommandIdentity,
): Cart {
  const result = storage.transactionSync(() => {
    const current = read(storage, customer, source, "variantId" in input ? input.variantId : "", identity);
    if (current.previous) {
      if (current.fingerprint !== identity.fingerprint)
        throw new ApiError("IDEMPOTENCY_CONFLICT", "Ключ уже использован с другим запросом");
      return JSON.parse(current.previous) as Cart;
    }
    const { cart, offered, changed, initial } = current;
    if (cart.revision !== input.expectedRevision) {
      if (changed || initial) persist(storage, customer, cart);
      return new ApiError("VERSION_CONFLICT", "Корзина изменилась. Попробуйте ещё раз.", { cart });
    }
    let next = cart;
    if ("confirm" in input) {
      if (cart.review) next = { ...cart, revision: cart.revision + 1, review: undefined };
    } else {
      if (input.quantity > 0 && !offered?.available)
        return new ApiError("STOCK_CHANGED", "Товар больше недоступен", { cart });
      const quantity = Math.min(input.quantity, offered?.stock ?? 999);
      const previous = cart.lines.find((line) => line.variantId === input.variantId);
      if ((previous?.quantity ?? 0) !== quantity || input.quantity > quantity) {
        const lines = cart.lines.filter((line) => line.variantId !== input.variantId);
        if (quantity && offered) lines.push({ ...offered, quantity });
        if (lines.length > 50) throw new ApiError("VALIDATION", "В корзине может быть до 50 разных фасовок");
        const totals = cartTotals(lines);
        let review = lines.length ? cart.review : undefined;
        if (offered && input.quantity > quantity) {
          const issues = new Map(review?.changes.map((issue) => [issue.variantId, issue]));
          issues.set(input.variantId, {
            ...issues.get(input.variantId),
            variantId: input.variantId,
            remaining: quantity,
          });
          review = {
            beforeMinor:
              review?.beforeMinor ??
              addMinor(totals.totalMinor, multiplyMinor(offered.priceMinor, input.quantity - quantity)),
            changes: [...issues.values()],
          };
        }
        next = { ...cart, revision: cart.revision + 1, ...totals, review };
      }
    }
    if (next !== cart || initial) persist(storage, customer, next);
    storage.sql.exec(
      "INSERT INTO idempotency(scope,key,fingerprint,response,created_at) VALUES(?,?,?,?,?)",
      `cart:${customer}`,
      identity.key,
      identity.fingerprint,
      JSON.stringify(next),
      Date.now(),
    );
    return next;
  });
  if (result instanceof ApiError) throw result;
  return result;
}
