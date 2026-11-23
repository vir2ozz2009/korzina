import type { CompositionEdits, CompositionLine } from "../../../src/shared/contracts/order-changes";
import { orderLineKey } from "../../../src/shared/contracts/order-changes";
import { ApiError } from "../../../src/shared/errors";
import { addMinor, multiplyMinor } from "../../../src/shared/money";
import type { ShopEnv } from "../../shop/env";
import { type ChangeState, compositionTotals, pendingComposition, requireChangeable } from "./state";
import { replacementLine, replacementOffers } from "./stock";

const pendingError = () => new ApiError("ANOTHER_CHANGE_PENDING", "По заказу уже ждём ответа");

export function planComposition(env: ShopEnv["Bindings"], state: ChangeState, input: CompositionEdits, money: boolean) {
  requireChangeable(state, input.expectedVersion);
  const { edits } = input;
  const { work, snapshot } = state;
  const pendingLines = new Set(work.composition?.lines.filter((line) => line.status === "pending").map(({ id }) => id));
  const byId = new Map(snapshot.lines.map((line) => [orderLineKey(line), line]));
  const requests = new Map<string, number>();
  for (const edit of edits) {
    if (edit.kind === "unavailable") continue;
    if (pendingComposition(work.composition)) throw pendingError();
    requests.set(edit.variantId, (requests.get(edit.variantId) ?? 0) + edit.quantity);
  }
  const offers = replacementOffers(env, [...requests.keys()]);
  for (const [variantId, quantity] of requests) replacementLine(env, offers.get(variantId), quantity);

  const seen = new Set<string>();
  let immediateLines = snapshot.lines.length;
  const lines = edits.map<CompositionLine>((edit) => {
    const id = edit.kind === "add" ? `add:${edit.variantId}` : edit.lineId;
    if (seen.has(id)) throw new ApiError("VALIDATION", "Позиция отмечена несколько раз");
    seen.add(id);
    if (pendingLines.has(id)) throw pendingError();
    const before = byId.get(id) ?? null;
    if (edit.kind !== "add" && !before) throw new ApiError("VALIDATION", "Позиция заказа недоступна");

    if (edit.kind === "unavailable" && before) {
      if (edit.quantity >= before.quantity) throw new ApiError("VALIDATION", "Укажите меньшее количество");
      if (!edit.quantity) immediateLines -= 1;
      const after = edit.quantity
        ? { ...before, quantity: edit.quantity, totalMinor: multiplyMinor(before.priceMinor, edit.quantity) }
        : null;
      return {
        id,
        kind: after ? "decrease" : "remove",
        status: "applied",
        before,
        after,
        deltaMinor: (after?.totalMinor ?? 0) - before.totalMinor,
      };
    }
    if (edit.kind === "unavailable" || before?.variantId === edit.variantId)
      throw new ApiError("VALIDATION", "Выберите другой товар");
    const after = replacementLine(env, offers.get(edit.variantId), edit.quantity);
    return {
      id,
      kind: edit.kind,
      status: "pending",
      before,
      after,
      deltaMinor: after.totalMinor - (before?.totalMinor ?? 0),
    };
  });
  if (!immediateLines) throw new ApiError("VALIDATION", "Последнюю позицию можно убрать при отмене заказа");

  const preview = new Map(byId);
  for (const line of lines) {
    if (line.after) preview.set(line.id, line.after);
    else preview.delete(line.id);
  }
  const total = addMinor(snapshot.deliveryMinor, ...[...preview.values()].map((line) => line.totalMinor));
  const totals = compositionTotals(state, snapshot.totalMinor, total, money);
  const signature = JSON.stringify({
    number: state.row.number,
    version: state.row.version,
    lines: lines.map(({ id, kind, after }) => [id, kind, after?.variantId, after?.quantity, after?.totalMinor]),
    total,
  });
  return { lines, totals, signature };
}

export function compositionQuote(plan: ReturnType<typeof planComposition>) {
  const { signature, ...result } = plan;
  return { ...result, quote: signature };
}
