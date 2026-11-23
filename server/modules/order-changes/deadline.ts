import type { CompositionLine } from "../../../src/shared/contracts/order-changes";
import { sellerOrderRow } from "../seller-orders/order";
import { applyLines } from "./apply-lines";
import { canChangeOrder, readChangeState } from "./state";
import { queueBuyerChange, writeOrderChange } from "./write";

const deadline = "json_extract(fulfillment_state,'$.composition.expiresAt')";
const open = `${deadline} IS NOT NULL AND status IN ('placed','accepted','ready')`;

export function expireCompositionChanges(storage: DurableObjectStorage, now: number, notify: (number: number) => void) {
  const rows = storage.sql
    .exec<{ number: number }>(
      `SELECT number FROM orders WHERE ${open} AND ${deadline}<=? ORDER BY ${deadline} LIMIT 20`,
      now,
    )
    .toArray();
  for (const { number } of rows) {
    const changed = storage.transactionSync(() => {
      const state = readChangeState(sellerOrderRow(storage, number));
      const { work } = state;
      const proposal = work.composition;
      if (!proposal?.expiresAt || now < proposal.expiresAt || !canChangeOrder(state.row, work)) return false;
      const expired = proposal.lines.filter((line) => line.status === "pending");
      const removed = new Map(
        expired.map((line): [string, CompositionLine] => [
          line.id,
          { ...line, status: "expired", after: null, deltaMinor: -(line.before?.totalMinor ?? 0) },
        ]),
      );
      proposal.lines = proposal.lines.map((line) => removed.get(line.id) ?? line);
      proposal.expiresAt = null;
      const stage = applyLines(storage, state, [...removed.values()]);
      const id = writeOrderChange(
        storage,
        state,
        "system",
        "composition.expired",
        { changeId: proposal.id, lines: [...removed.values()], stage },
        now,
        stage,
      );
      queueBuyerChange(storage, state, id, "composition", now);
      return true;
    });
    if (changed) notify(number);
  }
}

export async function scheduleCompositionDeadline(storage: DurableObjectStorage, time?: number) {
  const due =
    time ??
    storage.sql
      .exec<{ due: number | null }>(`SELECT ${deadline} AS due FROM orders WHERE ${open} ORDER BY ${deadline} LIMIT 1`)
      .toArray()[0]?.due;
  if (due == null) return;
  const previous = await storage.getAlarm();
  if (previous === null || due < previous) await storage.setAlarm(due);
}
