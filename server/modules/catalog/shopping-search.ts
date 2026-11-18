import type { readShoppingSearch } from "../../../src/shared/shopping-search";
import { findMatches, preferredVariants } from "./search";
import { readDocument, readLive } from "./service";

type Parsed = Exclude<ReturnType<typeof readShoppingSearch>, { kind: "error" }>;

export function readShoppingMatches(storage: DurableObjectStorage, query: Parsed, shopId: string) {
  const names = query.kind === "single" ? [query.q] : query.parts;
  const matches = new Map(
    [...new Set(names)].map((q) => [
      q,
      findMatches(storage, { scope: "all", q }, { limit: 4, nameOnly: query.kind === "dish" }),
    ]),
  );
  const ids = [...new Set([...matches.values()].flatMap((match) => match.ids))];
  const { items } = readDocument(storage, { limit: Math.max(1, ids.length) }, shopId, ids);
  const offers = readLive(
    storage,
    items.flatMap((item) => item.variants.map((variant) => variant.id)),
  );
  const byId = new Map(items.map((item) => [item.id, item]));
  const groups = Array.from(matches, ([term, match]) => {
    const products = match.ids.flatMap((id) => {
      const item = byId.get(id);
      return item ? [item] : [];
    });
    return {
      term,
      ids: products.map((item) => item.id),
      preferred: preferredVariants(match.requested, products, offers.items),
    };
  });
  return { items, offers, groups };
}
