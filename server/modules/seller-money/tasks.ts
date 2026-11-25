import { z } from "zod";
import type {
  moneyTasksQuery,
  SellerMoneyOverview,
  SellerMoneyPage,
  SellerMoneyTask,
} from "../../../src/shared/contracts/seller-money";
import { ApiError } from "../../../src/shared/errors";

type Context = Pick<SellerMoneyOverview, "currency" | "revision">;
type Row = { number: number; kind: SellerMoneyTask["kind"]; amount: number; at: number; action: 0 | 1; ready: 0 | 1 };
const columns = "number,kind,amount,at,1-needs_seller AS action,details_ready AS ready";
const order = "ORDER BY action,at,number,kind";
const pageSize = 10;
const cursorInput = z.tuple([z.string(), z.int(), z.int(), z.int(), z.enum(["review", "topUp", "refund"])]);

function task(row: Row): SellerMoneyTask {
  return {
    id: `${row.kind}:${row.number}`,
    number: row.number,
    kind: row.kind,
    amountMinor: row.amount,
    at: row.at,
    needsSeller: !row.action,
    detailsReady: !!row.ready,
  };
}

export function moneyTaskCounts(storage: DurableObjectStorage, currency: string) {
  const counts = { review: 0, topUp: 0, refund: 0 };
  for (const row of storage.sql.exec<{ kind: Row["kind"]; count: number }>(
    "SELECT kind,COUNT(*) AS count FROM seller_money_tasks WHERE currency=? AND amount>0 GROUP BY kind",
    currency,
  )) {
    counts[row.kind] = row.count;
  }
  return counts;
}

function paging(cursor: string, context: string) {
  try {
    const [saved, action, at, number, kind] = cursorInput.parse(JSON.parse(atob(cursor)));
    if (saved === context) return [action, at, number, kind] as const;
  } catch {}
  throw new ApiError("VALIDATION", "Список изменился");
}

export function moneyTasks(
  storage: DurableObjectStorage,
  { currency, revision }: Context,
  { group, cursor }: z.infer<typeof moneyTasksQuery>,
): SellerMoneyPage<SellerMoneyTask> {
  const conditions = ["currency=?", "amount>0", "kind=?"];
  const bindings: (string | number)[] = [currency, group];
  const context = JSON.stringify([currency, revision, group]);
  if (cursor) {
    conditions.push("(1-needs_seller,at,number,kind)>(?,?,?,?)");
    bindings.push(...paging(cursor, context));
  }
  const rows = storage.sql
    .exec<Row>(
      `SELECT ${columns} FROM seller_money_tasks WHERE ${conditions.join(" AND ")} ${order} LIMIT ?`,
      ...bindings,
      pageSize + 1,
    )
    .toArray();
  const last = rows[pageSize - 1];
  return {
    currency,
    revision,
    rows: rows.slice(0, pageSize).map(task),
    cursor:
      last && rows.length > pageSize
        ? btoa(JSON.stringify([context, last.action, last.at, last.number, last.kind]))
        : undefined,
  };
}
