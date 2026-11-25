import { z } from "zod";
import type {
  moneyOperationsQuery,
  SellerMoneyOperation,
  SellerMoneyOverview,
  SellerMoneyPage,
} from "../../../src/shared/contracts/seller-money";
import { calendarDate, shopDayStart } from "../../../src/shared/datetime";
import { ApiError } from "../../../src/shared/errors";
import { parseMinorInput } from "../../../src/shared/money";

type Selection = Pick<SellerMoneyOverview, "revision" | "period" | "currency" | "timeZone">;
const cursorInput = z.tuple([z.string(), z.int(), z.int()]);
const unknown = "COALESCE(method,'unknown')";
const pageSize = 10;

function limits({ period, timeZone }: Selection) {
  return [shopDayStart(period.from, timeZone), shopDayStart(calendarDate(period.to, 1), timeZone)] as const;
}

type PeriodTotals = Pick<
  SellerMoneyOverview,
  "receivedMinor" | "returnedMinor" | "methods" | "receivedIncomplete" | "returnedIncomplete"
>;

export function moneyTotals(storage: DurableObjectStorage, selection: Selection): PeriodTotals {
  const [start, end] = limits(selection);
  const { currency } = selection;
  const rows = storage.sql
    .exec<{
      kind: SellerMoneyOperation["kind"];
      method: SellerMoneyOverview["methods"][number]["method"];
      amount: number | null;
      missing: number;
      legacy: number;
    }>(
      `SELECT kind,${unknown} AS method,SUM(amount_minor) AS amount,COUNT(*)-COUNT(amount_minor) AS missing,0 AS legacy
        FROM seller_money_operations WHERE currency=? AND occurred_at>=? AND occurred_at<? GROUP BY kind,COALESCE(method,'unknown')
        UNION ALL SELECT 'received','unknown',NULL,1,1 FROM seller_money_unknown_history WHERE currency=? AND through>=?`,
      currency,
      start,
      end,
      currency,
      start,
    )
    .toArray();
  const incoming = rows.filter((row) => row.kind === "received");
  const outgoing = rows.filter((row) => row.kind === "returned");
  const total = (entries: typeof rows) =>
    entries.length && entries.every((row) => row.amount === null)
      ? null
      : entries.reduce((sum, row) => sum + (row.amount ?? 0), 0);
  return {
    receivedMinor: total(incoming),
    returnedMinor: total(outgoing),
    receivedIncomplete: incoming.some((row) => row.missing > 0),
    returnedIncomplete: outgoing.some((row) => row.missing > 0),
    methods: incoming.flatMap(({ method, amount }) => (amount === null ? [] : [{ method, amountMinor: amount }])),
  };
}

function paging(cursor: string, context: string) {
  try {
    const value = cursorInput.parse(JSON.parse(atob(cursor)));
    if (value[0] === context) return value.slice(1) as [number, number];
  } catch {}
  throw new ApiError("VALIDATION", "Список изменился");
}

export function moneyOperations(
  storage: DurableObjectStorage,
  selection: Selection,
  filters: z.infer<typeof moneyOperationsQuery>,
): SellerMoneyPage<SellerMoneyOperation> {
  const { revision, currency, period } = selection;
  const { kind, method, search, cursor } = filters;
  const conditions = ["currency=?", "occurred_at>=?", "occurred_at<?"];
  const bindings: (string | number | null)[] = [currency, ...limits(selection)];
  if (kind) {
    conditions.push("kind=?");
    bindings.push(kind);
  }
  if (method) {
    conditions.push(`kind='received' AND ${unknown}=?`);
    bindings.push(method);
  }
  if (search) {
    const order = /^(?:№\s*)?(\d+)$/u.exec(search)?.[1];
    const amount = parseMinorInput(search, currency);
    conditions.push("(number=? OR amount_minor=?)");
    bindings.push(order ?? null, amount ?? null);
  }
  const context = JSON.stringify([revision, period.from, period.to, currency, kind, method, search]);
  if (cursor) {
    conditions.push("(occurred_at,id)<(?,?)");
    bindings.push(...paging(cursor, encodeURIComponent(context)));
  }
  const rows = storage.sql
    .exec<SellerMoneyOperation>(
      `SELECT id,number,kind,amount_minor AS amountMinor,occurred_at AS at,
       CASE WHEN kind='received' THEN ${unknown} END AS method
     FROM seller_money_operations WHERE ${conditions.join(" AND ")}
     ORDER BY occurred_at DESC,id DESC LIMIT ?`,
      ...bindings,
      pageSize + 1,
    )
    .toArray();
  const last = rows[pageSize - 1];
  return {
    revision,
    currency,
    rows: rows.slice(0, pageSize),
    cursor:
      last && rows.length > pageSize
        ? btoa(JSON.stringify([encodeURIComponent(context), last.at, last.id]))
        : undefined,
  };
}
