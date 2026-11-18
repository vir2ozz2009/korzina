import type { CatalogListInput } from "../../../src/shared/contracts/catalog-list";
import { ApiError } from "../../../src/shared/errors";
import { soldRank } from "./queries";

const limit = 16;
type Key = string | number;
type Cursor = { filter: string; key: Key; id: string; version: number; selectionVersion: number; sold: number };

function readCursor(encoded: string, filter: string): Cursor {
  try {
    const value = JSON.parse(
      new TextDecoder().decode(Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))),
    ) as Cursor;
    if (
      value.filter === filter &&
      typeof value.id === "string" &&
      value.id &&
      (typeof value.key === "string" || Number.isSafeInteger(value.key)) &&
      Number.isSafeInteger(value.version) &&
      Number.isSafeInteger(value.selectionVersion)
    )
      return value;
  } catch {}
  throw new ApiError("VALIDATION", "Некорректная страница каталога");
}

function encode(value: Cursor) {
  return btoa(
    Array.from(new TextEncoder().encode(JSON.stringify(value)), (byte) => String.fromCharCode(byte)).join(""),
  );
}

export function selectionConditions(input: CatalogListInput) {
  const clauses = ["p.published=1", "p.visible=1", "p.has_catalog_offer=1"];
  const params: SqlStorageValue[] = [];
  if (input.inStock || input.min !== undefined || input.max !== undefined)
    clauses.push("p.available_price IS NOT NULL");
  for (const [operator, price] of [
    [">=", input.min],
    ["<=", input.max],
  ] as const) {
    if (price === undefined) continue;
    clauses.push(`p.available_price${operator}?`);
    params.push(price);
  }
  for (const category of [input.scope.startsWith("category:") ? input.scope.slice(9) : undefined, input.cat]) {
    if (!category) continue;
    clauses.push(`p.category_id IN (WITH RECURSIVE subtree(id) AS (
      SELECT id FROM categories WHERE id=? AND visible=1
      UNION SELECT c.id FROM categories c JOIN subtree s ON c.parent_id=s.id WHERE c.visible=1
    ) SELECT id FROM subtree)`);
    params.push(category);
  }
  if (input.scope.startsWith("brand:")) {
    clauses.push("p.brand_id=?");
    params.push(input.scope.slice(6));
  }
  if (input.brands) {
    const ids = [...new Set(input.brands.split(",").filter(Boolean))];
    if (ids.length) {
      clauses.push(`p.brand_id IN (${ids.map(() => "?").join(",")})`);
      params.push(...ids);
    }
  }
  return { clauses, params };
}

export function readSelection(storage: DurableObjectStorage, input: CatalogListInput) {
  const state = storage.sql
    .exec<{ version: number; hide: number; selectionVersion: number }>(
      "SELECT version, selection_version AS selectionVersion, hide_out_of_stock AS hide FROM catalog_state WHERE id=1",
    )
    .one();
  const filter = JSON.stringify([
    input.scope,
    input.sort,
    input.min,
    input.max,
    input.brands,
    input.cat,
    input.inStock,
    state.hide,
  ]);
  const cursor = input.cursor ? readCursor(input.cursor, filter) : undefined;
  if (cursor && (cursor.version !== state.version || cursor.selectionVersion !== state.selectionVersion))
    throw new ApiError("VERSION_CONFLICT", "Каталог обновился. Обновите список.");
  if (cursor && cursor.sold !== 0 && cursor.sold !== 1)
    throw new ApiError("VALIDATION", "Некорректная страница каталога");
  const { clauses, params } = selectionConditions(input);
  if (state.hide) clauses.push("p.available_price IS NOT NULL");
  const where = clauses.join(" AND ");
  const count = storage.sql
    .exec<{ count: number }>(`SELECT count(*) AS count FROM products p WHERE ${where}`, ...params)
    .one().count;
  const byPrice = input.sort === "price-asc" || input.sort === "price-desc";
  const key = byPrice ? "coalesce(p.available_price, -1)" : input.sort === "name" ? "p.name COLLATE NOCASE" : "p.id";
  const descending = input.sort === "price-desc";
  const order = descending ? "DESC" : "ASC";
  const comparison = descending ? "<" : ">";
  const pageParams: SqlStorageValue[] = [];
  let page = "";
  if (cursor) {
    if (!byPrice && input.sort !== "name") {
      page = `AND (${soldRank}, p.id) > (?,?)`;
      pageParams.push(cursor.sold, cursor.id);
    } else if (!byPrice) {
      page = `AND (${soldRank}, ${key}, p.id) > (?,?,?)`;
      pageParams.push(cursor.sold, cursor.key, cursor.id);
    } else if (cursor.sold) {
      page = `AND p.available_price IS NULL AND p.id ${comparison} ?`;
      pageParams.push(cursor.id);
    } else {
      page = `AND (p.available_price IS NULL OR (p.available_price, p.id) ${comparison} (?,?))`;
      pageParams.push(cursor.key, cursor.id);
    }
  }
  const sort = byPrice
    ? `p.available_price ${order} NULLS LAST, p.id ${order}`
    : input.sort === "name"
      ? `${soldRank}, ${key}, p.id`
      : `${soldRank}, p.id`;
  const rows = storage.sql
    .exec<{ id: string; key: Key; sold: number }>(
      `SELECT p.id, ${key} AS key, ${soldRank} AS sold FROM products p WHERE ${where} ${page}
      ORDER BY ${sort} LIMIT ?`,
      ...params,
      ...pageParams,
      limit + 1,
    )
    .toArray();
  const current = rows.slice(0, limit);
  const last = current.at(-1);
  return {
    catalogVersion: state.version,
    count,
    ids: current.map((row) => row.id),
    next:
      last && rows.length > limit
        ? encode({
            filter,
            key: last.key,
            id: last.id,
            sold: last.sold,
            version: state.version,
            selectionVersion: state.selectionVersion,
          })
        : null,
  };
}
