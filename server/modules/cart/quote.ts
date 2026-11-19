import { cartTotals } from "../../../src/shared/cart-totals";
import type { Cart, CartIssue, CartLine, CartReview } from "../../../src/shared/contracts/cart";
import type { PhotoMetadata } from "../../../src/shared/contracts/media";
import { catalogImage } from "../catalog/images";

export type SavedLine = Pick<
  CartLine,
  "variantId" | "productId" | "name" | "unit" | "priceMinor" | "quantity" | "available"
>;
export type SavedQuote = { lines: SavedLine[]; review?: CartReview };
type LiveLine = Omit<CartLine, "image" | "productId" | "available"> & {
  productId: string | null;
  available: 0 | 1;
  photo: (PhotoMetadata & { id: string }) | null;
};
export type CartSource = { id: string; mediaOrigin: string };

export function toLine(live: LiveLine, source: CartSource, saved?: SavedLine): CartLine {
  if (!live.productId)
    return {
      variantId: live.variantId,
      quantity: live.quantity,
      productId: saved?.productId ?? "",
      name: saved?.name ?? "Товар больше недоступен",
      unit: saved?.unit ?? "",
      priceMinor: saved?.priceMinor ?? 0,
      stock: 0,
      available: false,
      image: null,
    };
  const { photo, ...line } = live;
  return {
    ...line,
    productId: live.productId,
    available: !!live.available,
    image: photo ? catalogImage(photo.id, source.id, source.mediaOrigin, photo) : null,
  };
}

export function reconcileQuote(revision: number, currency: string, lines: CartLine[], saved: SavedQuote | null) {
  const old = new Map(saved?.lines.map((line) => [line.variantId, line]));
  const issues = new Map(saved?.review?.changes.map((issue) => [issue.variantId, issue]));
  let changed = false;
  const current = lines.map((line) => {
    const prior = old.get(line.variantId);
    const quantity = line.available ? Math.min(line.quantity, line.stock ?? 999) : line.quantity;
    const repriced = prior && prior.priceMinor !== line.priceMinor;
    if (quantity !== line.quantity || repriced || (prior && prior.available !== line.available)) {
      changed = true;
      const issue: CartIssue = { ...issues.get(line.variantId), variantId: line.variantId };
      if (repriced) issue.oldPriceMinor ??= prior.priceMinor;
      if (quantity !== line.quantity) issue.remaining = quantity;
      issue.unavailable = !line.available;
      issues.set(line.variantId, issue);
    }
    return { ...line, quantity };
  });
  const review = issues.size
    ? {
        beforeMinor:
          saved?.review?.beforeMinor ??
          cartTotals(saved?.lines.map((line) => ({ ...line, stock: null })) ?? lines).totalMinor,
        changes: [...issues.values()],
      }
    : undefined;
  const cart: Cart = { revision: revision + Number(changed), currency, ...cartTotals(current), review };
  return { cart, changed };
}

export function savedQuote(cart: Cart): SavedQuote {
  return {
    review: cart.review,
    lines: cart.lines.map(({ variantId, productId, name, unit, priceMinor, quantity, available }) => ({
      variantId,
      productId,
      name,
      unit,
      priceMinor,
      quantity,
      available,
    })),
  };
}
