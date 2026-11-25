import type { SalesPeriod, SalesRank } from "../../../src/shared/contracts/seller-sales";
import { ApiError } from "../../../src/shared/errors";
import { missingCompletion } from "./report";

const pageSize = 10;

function incompleteHistory(storage: DurableObjectStorage, timeZone: string, currency: string, period: SalesPeriod) {
  return (
    missingCompletion(storage, timeZone, currency, period) ||
    storage.sql
      .exec(
        "SELECT 1 FROM sales_orders WHERE currency=? AND day BETWEEN ? AND ? AND revenue_minor IS NULL LIMIT 1",
        currency,
        period.from,
        period.to,
      )
      .toArray().length > 0
  );
}

export function rankProducts(
  storage: DurableObjectStorage,
  timeZone: string,
  currency: string,
  period: SalesPeriod,
  cursor?: string,
): SalesRank {
  const revision = storage.sql
    .exec<{ value: string }>(
      `SELECT (SELECT version FROM catalog_state WHERE id=1) || ':' ||
      COALESCE((SELECT value FROM settings WHERE key='sales_revision'),'0') || ':' ||
      COALESCE((SELECT value FROM settings WHERE key='sales_projection_zone'),'') AS value`,
    )
    .one().value;
  const scope = `${period.from}/${period.to}/${currency}/${revision}`;
  const [key, offset] = cursor?.split("|") ?? [];
  const start = offset === undefined ? 0 : Number(offset);
  if (cursor && (key !== scope || !Number.isSafeInteger(start) || start < 0))
    throw new ApiError("VERSION_CONFLICT", "Список изменился");
  const incomplete = incompleteHistory(storage, timeZone, currency, period);
  const rows = storage.sql
    .exec<{ id: string; name: string; quantity: number | null; maxQuantity: number | null }>(
      `WITH sold AS (
      SELECT product_id,MAX(name) AS name,SUM(quantity) AS quantity FROM sales_products_daily
      WHERE currency=? AND day BETWEEN ? AND ? GROUP BY product_id
    ), ranked AS (
      SELECT p.id,p.name,COALESCE(s.quantity, CASE WHEN ? THEN NULL ELSE 0 END) AS quantity
      FROM products p LEFT JOIN sold s ON p.id=s.product_id
      UNION ALL SELECT s.product_id,s.name,s.quantity FROM sold s WHERE NOT EXISTS(SELECT 1 FROM products p WHERE p.id=s.product_id)
    )
    SELECT *,MAX(quantity) OVER () AS maxQuantity FROM ranked
    ORDER BY quantity DESC,name,id LIMIT ? OFFSET ?`,
      currency,
      period.from,
      period.to,
      Number(incomplete),
      pageSize + 1,
      start,
    )
    .toArray();
  return {
    period,
    rows: rows.slice(0, pageSize).map(({ maxQuantity, ...row }) => ({
      ...row,
      incomplete,
      share: row.quantity === null ? null : maxQuantity && maxQuantity > 0 ? row.quantity / maxQuantity : 0,
    })),
    next: rows.length > pageSize ? `${scope}|${start + pageSize}` : undefined,
  };
}

export function readProductSales(
  storage: DurableObjectStorage,
  timeZone: string,
  currency: string,
  period: SalesPeriod,
  id: string,
  variant: string | undefined,
  canReadCatalog: boolean,
) {
  const product = storage.sql
    .exec<{ name: string; archived: number }>(
      `SELECT name,0 AS archived FROM products WHERE id=?
     UNION ALL SELECT name,1 FROM sales_lines WHERE product_id=? ORDER BY archived LIMIT 1`,
      id,
      id,
    )
    .toArray()[0];
  if (!product) throw new ApiError("NOT_FOUND", "Товар недоступен");
  const variants = storage.sql
    .exec<{ id: string; unit: string; archived: number }>(
      `SELECT id,name AS unit,0 AS archived FROM variants WHERE product_id=?
     UNION ALL SELECT variant_id,MAX(unit),1 FROM sales_lines s WHERE product_id=?
       AND NOT EXISTS(SELECT 1 FROM variants v WHERE v.id=s.variant_id AND v.product_id=s.product_id)
      GROUP BY variant_id ORDER BY archived,unit,id`,
      id,
      id,
    )
    .toArray()
    .map((variant) => ({ ...variant, archived: !!variant.archived }));
  if (variant && !variants.some(({ id }) => id === variant)) throw new ApiError("NOT_FOUND", "Фасовка недоступна");
  const totals = storage.sql
    .exec<{ quantity: number; orderCount: number; revenueMinor: number }>(
      `SELECT COALESCE(SUM(quantity),0) AS quantity, COUNT(DISTINCT number) AS orderCount,
        COALESCE(SUM(revenue_minor),0) AS revenueMinor FROM sales_lines
      WHERE product_id=? AND currency=? AND day BETWEEN ? AND ?${variant ? " AND variant_id=?" : ""}`,
      id,
      currency,
      period.from,
      period.to,
      ...(variant ? [variant] : []),
    )
    .one();
  const incomplete = incompleteHistory(storage, timeZone, currency, period);
  const values =
    incomplete && totals.orderCount === 0 ? { quantity: null, orderCount: null, revenueMinor: null } : totals;
  return {
    ...values,
    currency,
    period,
    timeZone,
    incomplete,
    name: product.name,
    variants,
    archived: !!product.archived || variants.some((item) => item.id === variant && item.archived),
    canOpenProduct: canReadCatalog && !product.archived,
  };
}
