import type { CatalogSearchInput } from "../../../src/shared/contracts/catalog-list";
import { soldRank } from "./queries";
import { selectionConditions } from "./selection";
import { readDocument, readLive } from "./service";

const weightPattern = /(?:^|\s)(\d+(?:[,.]\d+)?)\s*(кг|мл|г|л)(?=$|\s)/u;
const tokenize = (s: string) =>
  s
    .toLocaleLowerCase("ru")
    .replaceAll("ё", "е")
    .match(/[\p{L}\p{N}]+/gu) ?? [];
function weight(value: string, exact = false) {
  const normalized = value.trim().toLocaleLowerCase("ru");
  const match = normalized.match(weightPattern);
  if (!match || (exact && match[0] !== normalized)) return null;
  const [, amount, unit] = match;
  return {
    quantity: +amount.replace(",", ".") * (unit === "кг" || unit === "л" ? 1000 : 1),
    volume: unit === "л" || unit === "мл",
  };
}
function near(a: string, b: string) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] === b[i]) continue;
    const left = a.slice(i),
      right = b.slice(i);
    return (
      left.slice(1) === right ||
      left === right.slice(1) ||
      left.slice(1) === right.slice(1) ||
      (left[0] === right[1] && left[1] === right[0] && left.slice(2) === right.slice(2))
    );
  }
  return true;
}
export function findMatches(
  storage: DurableObjectStorage,
  input: CatalogSearchInput,
  { limit = 16, nameOnly = false } = {},
) {
  const normalized = input.q.toLocaleLowerCase("ru");
  const requested = weight(normalized);
  const terms = tokenize(normalized.replace(weightPattern, " ")).slice(0, 8);
  const { clauses, params } = selectionConditions(input);
  clauses.push("(p.available_price IS NOT NULL OR (SELECT hide_out_of_stock FROM catalog_state WHERE id=1)=0)");
  const order =
    input.sort === "price-asc"
      ? "p.available_price ASC NULLS LAST"
      : input.sort === "price-desc"
        ? "p.available_price DESC NULLS LAST"
        : input.sort === "name"
          ? "p.name COLLATE NOCASE"
          : "bm25(catalog_search,0,8,5,4,1)";
  const lookup = (match: string) =>
    storage.sql
      .exec<{ id: string; name: string; count: number }>(
        `
    SELECT p.id,p.name, (SELECT count(*) FROM catalog_search JOIN products p ON p.id=catalog_search.product_id
          WHERE catalog_search MATCH ? AND ${clauses.join(" AND ")}) AS count
    FROM catalog_search JOIN products p ON p.id=catalog_search.product_id
    WHERE catalog_search MATCH ? AND ${clauses.join(" AND ")}
    ORDER BY ${soldRank}, ${order}, p.id LIMIT ?`,
        match,
        ...params,
        match,
        ...params,
        limit,
      )
      .toArray();
  const query = (words: string[]) => words.map((token) => `${nameOnly ? "name : " : ""}"${token}"*`).join(" AND ");
  let rows = terms.length ? lookup(query(terms)) : [];
  let suggestion: string | null = null;
  if (!nameOnly && !rows.length && terms.length === 1 && terms[0].length >= 4) {
    const token = terms[0];
    rows = lookup(query([token.slice(0, 2)])).filter((row) =>
      tokenize(row.name).some((candidate) => near(token, candidate)),
    );
    suggestion = rows.length ? (tokenize(rows[0].name).find((candidate) => near(token, candidate)) ?? null) : null;
  }
  return { ids: rows.map((row) => row.id), count: rows[0]?.count ?? 0, suggestion, requested };
}

export function preferredVariants(
  requested: ReturnType<typeof weight>,
  items: ReturnType<typeof readDocument>["items"],
  offers: ReturnType<typeof readLive>["items"],
) {
  return !requested
    ? {}
    : Object.fromEntries(
        items.flatMap((item) => {
          const match = item.variants.find((variant) => {
            const value = weight(variant.name, true);
            return (
              value?.quantity === requested.quantity &&
              value.volume === requested.volume &&
              offers.some((offer) => offer.id === variant.id && offer.available)
            );
          });
          return match ? [[item.id, match.id]] : [];
        }),
      );
}

export function readSearch(storage: DurableObjectStorage, input: CatalogSearchInput, shopId: string) {
  const { ids, count, suggestion, requested } = findMatches(storage, input);
  const document = readDocument(storage, { limit: 16, productIds: ids.join(",") || "," }, shopId);
  const byId = new Map(document.items.map((item) => [item.id, item]));
  const items = ids.flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });
  const offers = readLive(
    storage,
    items.flatMap((item) => item.variants.map((item) => item.id)),
  );
  return {
    ...document,
    items,
    count: suggestion ? items.length : count,
    next: null,
    offers,
    preferred: preferredVariants(requested, items, offers.items),
    suggestion,
  };
}
