import { cartTotals } from "../../../src/shared/cart-totals";
import type { Cart, CartCommandInput } from "../../../src/shared/contracts/cart";
import { ApiError } from "../../../src/shared/errors";
import { addMinor, multiplyMinor } from "../../../src/shared/money";
import type { CommandIdentity } from "../../middleware/idempotency";
import { parseSelection, rememberOrderedAddress } from "../fulfillment/service";
import { pricePromoCart } from "../promo/cart";
import { readCartState } from "./cart-state";
import { type CartSource, savedQuote } from "./quote";

export { readCartState } from "./cart-state";

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
    const { cart, changed, initial, codes, hasAutomatic } = readCartState(storage, customer, source);
    if (changed || initial) persistCart(storage, customer, cart);
    return source.promotions
      ? pricePromoCart(storage, customer, customer.startsWith("telegram:"), cart, codes, source.now, hasAutomatic)
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
        ? pricePromoCart(
            storage,
            customer,
            customer.startsWith("telegram:"),
            value,
            codes,
            source.now,
            current.hasAutomatic,
          )
        : value;
    if (cart.revision !== input.expectedRevision) {
      if (changed || initial) persistCart(storage, customer, cart);
      return new ApiError("VERSION_CONFLICT", "Корзина изменилась. Попробуйте ещё раз.", { cart: reprice(cart) });
    }
    let next = cart;
    if ("promoAction" in input) {
      if (!source.promotions) throw new ApiError("FORBIDDEN", "Акции недоступны");
      const prior = reprice(cart);
      if ("code" in input) {
        const candidate = pricePromoCart(
          storage,
          customer,
          customer.startsWith("telegram:"),
          cart,
          { code: input.code, alternative: null },
          source.now,
        );
        const reason = candidate.promo?.reason;
        if (
          (input.promoAction === "compare" || codes.alternative !== input.code || reason === "unknown") &&
          ["unknown", "expired", "disabled", "scheduled", "limit", "personal_limit", "purchase_used"].includes(
            reason ?? "",
          )
        )
          throw new ApiError("VALIDATION", "Промокод не применён", { promo: candidate.promo });
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
      }
      if (input.promoAction === "remove") codes.code = null;
      else if ("code" in input) codes.code = input.code;
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
