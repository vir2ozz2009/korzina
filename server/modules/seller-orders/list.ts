import { z } from "zod";
import type { OrderStage } from "../../../src/shared/contracts/buyer-order";
import type {
  SellerOrderPage,
  SellerOrderSummary,
  SellerOrdersQuery,
} from "../../../src/shared/contracts/seller-order";
import { ApiError } from "../../../src/shared/errors";

const cursorInput = z.tuple([z.int(), z.string(), z.int(), z.string(), z.int()]);
const stageOrder =
  "CASE stage WHEN 'placed' THEN 0 WHEN 'accepted' THEN 1 WHEN 'ready' THEN 2 WHEN 'handed' THEN 3 ELSE 4 END";
const normalizedPhone = "replace(replace(replace(replace(replace(phone,'+',''),' ',''),'-',''),'(',''),')','')";
const active = "'placed','accepted','ready','handed'";
const closed = "'completed','cancelled'";
const limit = 20;

export function orderListRevision(storage: DurableObjectStorage) {
  return storage.sql
    .exec<{ rev: number }>("SELECT CAST(value AS INTEGER) AS rev FROM settings WHERE key='seller_orders_revision'")
    .one().rev;
}

export function sellerOrders(storage: DurableObjectStorage, input: SellerOrdersQuery, timeZone: string) {
  const rev = orderListRevision(storage);
  if (input.rev === rev && !input.cursor) return { rev, unchanged: true as const };
  const search = input.search?.toLocaleLowerCase("ru") ?? "";
  const method = input.method ?? "";
  const completed = input.tab === "completed";
  const debt = completed && input.debt === "1";
  const fingerprint = JSON.stringify([input.tab, method, debt, search]);
  const query = [
    `stage IN (${completed ? closed : active})`,
    ...(method ? ["method=?"] : []),
    ...(debt ? ["debt_minor>0"] : []),
    ...(search
      ? [
          `(instr(CAST(number AS TEXT),?) > 0 OR instr(name_key,?) > 0 OR (? <> '' AND instr(${normalizedPhone},?) > 0))`,
        ]
      : []),
  ].join(" AND ");
  const digits = search.startsWith("№") ? "" : search.replace(/\D/gu, "");
  const filters = [
    ...(method ? [method] : []),
    ...(search ? [search.replace(/^№\s*/u, ""), search, digits, digits] : []),
  ];
  let after: [number, string, number] | undefined;
  if (input.cursor) {
    const parsed = cursorInput.safeParse(JSON.parse(readCursor(input.cursor)));
    if (!parsed.success || parsed.data[0] !== rev || parsed.data[1] !== fingerprint)
      throw new ApiError("VALIDATION", "Список изменился. Откройте первую страницу.");
    after = [parsed.data[2], parsed.data[3], parsed.data[4]];
  }
  const counts = storage.sql
    .exec<{ stage: OrderStage; total: number; matching: number }>(
      `SELECT stage,COUNT(*) AS total,SUM(CASE WHEN ${query} THEN 1 ELSE 0 END) AS matching
      FROM seller_order_index GROUP BY stage`,
      ...filters,
    )
    .toArray();
  const day = completed ? "receiving_at" : "CASE WHEN receiving_at='' THEN '9999' ELSE receiving_at END";
  const order = completed ? "section,sort_at DESC,sort_number DESC" : "section,sort_at,sort_number";
  type Row = SellerOrderSummary & { section: number; sort_at: string; sort_number: number };
  const rows = storage.sql
    .exec<Row>(
      `WITH selection AS (
      SELECT number,stage,revision,method,receiving_at AS receivingAt,created_at AS createdAt,name,currency,
        total_minor AS totalMinor,payment_status AS paymentStatus,packed,lines,debt_minor AS debtMinor,
        refund_minor AS refundMinor,${stageOrder} AS section,${day} AS sort_at,number AS sort_number
      FROM seller_order_index WHERE ${query}
    ) SELECT * FROM selection
    ${after ? `WHERE (section,sort_at,sort_number) ${completed ? "<" : ">"} (?,?,?)` : ""}
    ORDER BY ${order} LIMIT ${limit + 1}`,
      ...filters,
      ...(after ?? []),
    )
    .toArray();
  const orders = rows.slice(0, limit).map(({ section: _, sort_at: _date, sort_number: _number, ...row }) => row);
  const last = rows[limit - 1];
  const cursor =
    rows.length > limit && last
      ? encodeURIComponent(JSON.stringify([rev, fingerprint, last.section, last.sort_at, last.sort_number]))
      : undefined;
  return {
    rev,
    timeZone,
    orders,
    active: counts
      .filter(({ stage }) => stage !== "completed" && stage !== "cancelled")
      .reduce((sum, row) => sum + row.total, 0),
    newlyPlaced: counts.find(({ stage }) => stage === "placed")?.total ?? 0,
    counts: Object.fromEntries(counts.map(({ stage, matching }) => [stage, matching])),
    cursor,
  } satisfies SellerOrderPage;
}

function readCursor(cursor: string) {
  try {
    const decoded = decodeURIComponent(cursor);
    JSON.parse(decoded);
    return decoded;
  } catch {
    throw new ApiError("VALIDATION", "Список изменился. Откройте первую страницу.");
  }
}
