import type { Cart, CartChangeInput, CartLine } from "../../../src/shared/contracts/cart";
import { ApiError } from "../../../src/shared/errors";
import { addMinor, multiplyMinor } from "../../../src/shared/money";
import type { CommandIdentity } from "../../middleware/idempotency";

type StoredLine = { variantId: string; quantity: number };
type CartState = {
  revision: number;
  currency: string;
  lines: string;
  offered: string | null;
  fingerprint: string | null;
  response: string | null;
};
const fields = `'variantId',v.id,'productId',v.product_id,'name',p.name,'unit',v.name,
  'priceMinor',v.price_minor,'stock',v.stock,'available',v.visible AND v.product_available AND (v.stock IS NULL OR v.stock>0)`;

function cartTotals(lines: CartLine[]) {
  return {
    count: lines.reduce((sum, line) => sum + line.quantity, 0),
    totalMinor: addMinor(...lines.map((line) => multiplyMinor(line.priceMinor, line.quantity))),
  };
}

export function readCart(storage: DurableObjectStorage, customer: string, variantId = "", identity?: CommandIdentity) {
  const row = storage.sql
    .exec<CartState>(
      `SELECT COALESCE(c.revision,0) AS revision,s.currency,
      (SELECT json_group_array(json_object(${fields},'quantity',json_extract(j.value,'$.quantity')))
        FROM json_each(COALESCE(c.lines,'[]')) j
        JOIN variants v ON v.id=json_extract(j.value,'$.variantId') JOIN products p ON p.id=v.product_id) AS lines,
      (SELECT json_object(${fields},'quantity',0) FROM variants v JOIN products p ON p.id=v.product_id WHERE v.id=?) AS offered, i.fingerprint,i.response
      FROM catalog_state s LEFT JOIN carts c ON c.customer=? LEFT JOIN idempotency i ON i.scope=? AND i.key=? WHERE s.id=1`,
      variantId,
      customer,
      `cart:${customer}`,
      identity?.key ?? "",
    )
    .one();
  const lines = (JSON.parse(row.lines) as CartLine[]).map((line) => ({ ...line, available: Boolean(line.available) }));
  const cart: Cart = { revision: row.revision, currency: row.currency, lines, ...cartTotals(lines) };
  return {
    cart,
    previous: row.response ? { response: row.response, fingerprint: row.fingerprint } : null,
    offered: row.offered ? (JSON.parse(row.offered) as CartLine) : null,
  };
}

export function changeCart(
  storage: DurableObjectStorage,
  customer: string,
  input: CartChangeInput,
  identity: CommandIdentity,
): Cart {
  return storage.transactionSync(() => {
    const { cart, offered, previous } = readCart(storage, customer, input.variantId, identity);
    if (previous) {
      if (previous.fingerprint !== identity.fingerprint)
        throw new ApiError("IDEMPOTENCY_CONFLICT", "Ключ уже использован с другим запросом");
      return JSON.parse(previous.response) as Cart;
    }
    const result = applyChange(storage, customer, input, cart, offered);
    storage.sql.exec(
      "INSERT INTO idempotency(scope,key,fingerprint,response,created_at) VALUES(?,?,?,?,?)",
      `cart:${customer}`,
      identity.key,
      identity.fingerprint,
      JSON.stringify(result),
      Date.now(),
    );
    return result;
  });
}

function applyChange(
  storage: DurableObjectStorage,
  customer: string,
  input: CartChangeInput,
  cart: Cart,
  offered: CartLine | null,
): Cart {
  if (cart.revision !== input.expectedRevision)
    throw new ApiError("VERSION_CONFLICT", "Корзина изменилась. Попробуйте ещё раз.", { cart });
  if (input.quantity > 0 && !offered?.available)
    throw new ApiError("STOCK_CHANGED", "Товар больше недоступен", { cart });
  const quantity = Math.min(input.quantity, offered?.stock ?? 999);
  const previous = cart.lines.find((line) => line.variantId === input.variantId);
  if ((previous?.quantity ?? 0) === quantity) return cart;
  const lines = cart.lines.filter((line) => line.variantId !== input.variantId);
  if (quantity && offered) lines.push({ ...offered, quantity, available: Boolean(offered.available) });
  if (lines.length > 50) throw new ApiError("VALIDATION", "В корзине может быть до 50 разных фасовок");
  const stored: StoredLine[] = lines.map(({ variantId, quantity }) => ({ variantId, quantity }));
  storage.sql.exec(
    `INSERT INTO carts(customer,revision,lines) VALUES(?,?,?)
      ON CONFLICT(customer) DO UPDATE SET revision=excluded.revision,lines=excluded.lines`,
    customer,
    cart.revision + 1,
    JSON.stringify(stored),
  );
  return { ...cart, revision: cart.revision + 1, lines, ...cartTotals(lines) };
}
