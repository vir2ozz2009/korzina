import type { ShopEnv } from "../../shop/env";
import { findMatches } from "../catalog/search";
import { replacementOffers } from "./stock";

export function pickReplacements(env: ShopEnv["Bindings"], query: string) {
  const { storage } = env;
  const products = query
    ? findMatches(storage, { q: query, scope: "all" }, { limit: 16, nameOnly: true }).ids
    : storage.sql
        .exec<{ id: string }>(
          "SELECT id FROM products WHERE published=1 AND visible=1 AND has_catalog_offer=1 AND catalog_sold_out=0 ORDER BY id LIMIT 16",
        )
        .toArray()
        .map(({ id }) => id);
  const ids = storage.sql
    .exec<{ id: string }>(
      `SELECT id FROM variants WHERE product_id IN(SELECT value FROM json_each(?))
      AND visible=1 AND product_available=1 AND product_paused=0 AND sale_pause IS NULL
      AND (stock IS NULL OR stock>0) ORDER BY product_id,position LIMIT 48`,
      JSON.stringify(products),
    )
    .toArray();
  return [
    ...replacementOffers(
      env,
      ids.map(({ id }) => id),
    ).values(),
  ];
}
