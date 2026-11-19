import { cartTotals } from "../../../src/shared/cart-totals";
import type { RepeatPreview, RepeatResult } from "../../../src/shared/contracts/buyer-order";
import { ApiError } from "../../../src/shared/errors";
import type { CommandIdentity } from "../../middleware/idempotency";
import { executeCommand } from "../../shop/commands";
import type { ShopEnv } from "../../shop/env";
import { persistCart, readCartState } from "../cart/service";
import { buyerOrderRow, unpackOrder } from "./buyer-orders";

type Shop = ShopEnv["Bindings"];

function inspect(env: Shop, customer: string, number: number) {
  const { lines } = unpackOrder(buyerOrderRow(env.storage, customer, number));
  const { cart, offered } = readCartState(
    env.storage,
    customer,
    { id: env.shop.id, mediaOrigin: env.media.MEDIA_PUBLIC_URL },
    lines.map(({ variantId }) => variantId),
  );
  const available = new Map(offered.filter((line) => line.available).map((line) => [line.variantId, line]));
  const next = new Map(cart.lines.map((line) => [line.variantId, line]));
  const candidates = lines.map(({ variantId, name, unit, quantity: requested, priceMinor: previousMinor }) => {
    const offer = available.get(variantId);
    const before = next.get(variantId)?.quantity ?? 0;
    const canAdd = offer && (next.has(variantId) || next.size < 50);
    const quantity = canAdd ? Math.min(requested, Math.max(0, (offer.stock ?? 999) - before)) : 0;
    if (offer && quantity > 0) next.set(variantId, { ...offer, quantity: before + quantity });
    return { variantId, name, unit, requested, quantity, previousMinor, priceMinor: offer?.priceMinor ?? null };
  });
  const preview: RepeatPreview = {
    lines: candidates,
    check: JSON.stringify(candidates.map(({ variantId, quantity, priceMinor }) => [variantId, quantity, priceMinor])),
    expectedCartRevision: cart.revision,
  };
  return { cart, next, preview };
}

export function previewRepeatOrder(env: Shop, customer: string, number: number) {
  return inspect(env, customer, number).preview;
}

export function repeatBuyerOrder(
  env: Shop,
  customer: string,
  number: number,
  input: Pick<RepeatPreview, "check" | "expectedCartRevision">,
  command: CommandIdentity,
) {
  return executeCommand<RepeatResult>(env.storage, env.db, `order-repeat:${customer}:${number}`, command, () => {
    const { cart, next, preview } = inspect(env, customer, number);
    if (input.expectedCartRevision !== preview.expectedCartRevision || input.check !== preview.check)
      throw new ApiError("VERSION_CONFLICT", "Условия изменились. Проверьте товары ещё раз.", preview);
    if (!preview.lines.some(({ quantity }) => quantity > 0))
      throw new ApiError("STOCK_CHANGED", "Нет товаров, которые можно добавить");
    const updated = { ...cart, ...cartTotals([...next.values()]), revision: cart.revision + 1 };
    persistCart(env.storage, customer, updated);
    return { status: 200, body: { cart: updated, lines: preview.lines } };
  }).body;
}
