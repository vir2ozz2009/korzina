import { cartTotals } from "../../../src/shared/cart-totals";
import type { Cart, CartCommandInput } from "../../../src/shared/contracts/cart";
import { ApiError } from "../../../src/shared/errors";
import { addMinor, multiplyMinor } from "../../../src/shared/money";
import type { CommandIdentity } from "../../middleware/idempotency";
import { parseSelection, rememberOrderedAddress } from "../fulfillment/service";
import { effectivePrice, pricePromoCart } from "../promo/cart";
import { type CartSource, reconcileQuote, type SavedQuote, savedQuote, toLine } from "./quote";

type CartState = {
  revision: number;
  currency: string;
  lines: string;
  quote: string | null;
  fingerprint: string | null;
  response: string | null;
  promo_code: string | null;
  promo_alternative: string | null;
};

export function readCartState(
  storage: DurableObjectStorage,
  customer: string,
  source: CartSource,
  variantIds: string[] = [],
  identity?: CommandIdentity,
) {
  const now = source.now ?? Date.now();
  const effective = effectivePrice("v.", !!source.promotions, now);
  const variantId = variantIds[0] ?? "";
  const batch = variantIds.length > 1;
  const row = storage.sql
    .exec<CartState>(
      `SELECT COALESCE(c.revision,0) AS revision,s.currency,c.quote,i.fingerprint,i.response,c.promo_code,c.promo_alternative,
      (SELECT json_group_array(json_object(
        'variantId',w.variant_id,'productId',p.id,'name',p.name,'unit',v.name,'quantity',w.quantity,
        'priceMinor',${effective.price},'oldPriceMinor',${effective.old},${source.promotions ? "'categoryId',p.category_id," : ""}'stock',v.stock,
        'available',COALESCE(v.visible AND v.product_available AND NOT v.product_paused AND v.sale_pause IS NULL AND (v.stock IS NULL OR v.stock>0),0),
        'photo',CASE WHEN m.id IS NOT NULL THEN json_object('id',m.id,'edgeColor',m.edge_color,'cropPosition',json(m.crop_position)) END))
      FROM (SELECT json_extract(j.value,'$.variantId') AS variant_id,json_extract(j.value,'$.quantity') AS quantity
            FROM json_each(COALESCE(c.lines,'[]')) j
            UNION ALL ${batch ? "SELECT value,0 FROM json_each(?)" : "SELECT ?,0 WHERE ? != ''"}) w
      LEFT JOIN variants v ON v.id=w.variant_id LEFT JOIN products p ON p.id=v.product_id
      LEFT JOIN media m ON m.id=COALESCE(v.photo_id, (
        SELECT pp.media_id FROM product_photos pp WHERE pp.product_id=p.id ORDER BY pp.position LIMIT 1
      )) AND m.ready=1 AND m.status='attached') AS lines
      FROM catalog_state s LEFT JOIN carts c ON c.customer=?
      LEFT JOIN idempotency i ON i.scope=? AND i.key=? WHERE s.id=1`,
      ...(batch ? [JSON.stringify(variantIds)] : [variantId, variantId]),
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
    codes: { code: row.promo_code, alternative: row.promo_alternative },
    initial: !saved && current.cart.lines.length > 0,
    offered: rows.filter((line) => line.quantity === 0),
    previous: row.response,
    fingerprint: row.fingerprint,
  };
}

export function persistCart(storage: DurableObjectStorage, customer: string, cart: Cart) {
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
    const { cart, changed, initial, codes } = readCartState(storage, customer, source);
    if (changed || initial) persistCart(storage, customer, cart);
    return source.promotions
      ? pricePromoCart(storage, customer, customer.startsWith("telegram:"), cart, codes, source.now)
      : cart;
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
    if (receiving.mode === "delivery") {
      next.lastUsedAddress = receiving;
      next.savedAddresses = rememberOrderedAddress(selection.savedAddresses, receiving);
      if (next.savedAddresses !== selection.savedAddresses) next.addressesRevision = cart.revision + 1;
    }
  }
  const extras = cartTotals(cart.lines.filter((line) => !line.available));
  storage.sql.exec(
    "UPDATE carts SET revision=?,lines=?,quote=?,receiving=?,updated_at=?,promo_code=NULL,promo_alternative=NULL WHERE customer=?",
    cart.revision + 1,
    JSON.stringify(extras.lines.map(({ variantId, quantity }) => ({ variantId, quantity }))),
    JSON.stringify(savedQuote({ ...cart, ...extras, review: undefined })),
    JSON.stringify(next),
    Date.now(),
    customer,
  );
}

export function changeCart(
  storage: DurableObjectStorage,
  customer: string,
  source: CartSource,
  input: CartCommandInput,
  identity: CommandIdentity,
): Cart {
  const result = storage.transactionSync(() => {
    const current = readCartState(storage, customer, source, "variantId" in input ? [input.variantId] : [], identity);
    if (current.previous) {
      if (current.fingerprint !== identity.fingerprint)
        throw new ApiError("IDEMPOTENCY_CONFLICT", "Ключ уже использован с другим запросом");
      return JSON.parse(current.previous) as Cart;
    }
    const {
      cart,
      offered: [offered],
      changed,
      initial,
      codes,
    } = current;
    const reprice = (value: Cart) =>
      source.promotions
        ? pricePromoCart(storage, customer, customer.startsWith("telegram:"), value, codes, source.now)
        : value;
    if (cart.revision !== input.expectedRevision) {
      if (changed || initial) persistCart(storage, customer, cart);
      return new ApiError("VERSION_CONFLICT", "Корзина изменилась. Попробуйте ещё раз.", { cart: reprice(cart) });
    }
    let next = cart;
    if ("promoAction" in input) {
      if (!source.promotions) throw new ApiError("FORBIDDEN", "Акции недоступны");
      const prior = reprice(cart);
      if (input.promoAction !== "remove") {
        const candidate = pricePromoCart(
          storage,
          customer,
          customer.startsWith("telegram:"),
          cart,
          { code: input.code, alternative: null },
          source.now,
        );
        const reason = candidate.promo?.reason;
        if (input.promoAction === "compare")
          return {
            ...prior,
            promo: {
              ...prior.promo,
              alternative: {
                code: input.code,
                totalMinor: candidate.totalMinor,
                reason,
                missingMinor: candidate.promo?.missingMinor,
                missingQuantity: candidate.promo?.missingQuantity,
              },
            },
          };
        if (codes.code && codes.code !== input.code && input.comparedTotal !== candidate.totalMinor)
          throw new ApiError("VERSION_CONFLICT", "Пересчитайте замену кода", { cart: prior });
        if (
          codes.alternative !== input.code &&
          ["unknown", "expired", "disabled", "scheduled", "limit", "personal_limit", "purchase_used"].includes(
            reason ?? "",
          )
        )
          throw new ApiError("VALIDATION", "Промокод не применён", { promo: candidate.promo });
      }
      codes.code = input.promoAction === "remove" ? null : input.code;
      codes.alternative = null;
      next = { ...cart, revision: cart.revision + 1 };
      persistCart(storage, customer, next);
      storage.sql.exec("UPDATE carts SET promo_code=?,promo_alternative=NULL WHERE customer=?", codes.code, customer);
    } else if ("confirm" in input) {
      if (cart.review) next = { ...cart, revision: cart.revision + 1, review: undefined };
    } else {
      if (input.quantity > 0 && !offered?.available)
        return new ApiError("STOCK_CHANGED", "Товар больше недоступен", { cart: reprice(cart) });
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
    if (!("promoAction" in input) && (next !== cart || initial)) persistCart(storage, customer, next);
    next = reprice(next);
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
