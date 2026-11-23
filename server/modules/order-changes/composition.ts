import type { CompositionAnswer, CompositionEdits, CompositionLine } from "../../../src/shared/contracts/order-changes";
import { ApiError } from "../../../src/shared/errors";
import type { Seller } from "../../auth/roles";
import type { CommandIdentity } from "../../middleware/idempotency";
import { executeCommand } from "../../shop/commands";
import type { ShopEnv } from "../../shop/env";
import { buyerOrder, buyerOrderRow } from "../checkout/buyer-orders";
import { sellerOrderRow } from "../seller-orders/order";
import { applyLines } from "./apply-lines";
import { compositionQuote, planComposition } from "./composition-plan";
import { orderComposition, pendingComposition, readChangeState, requireChangeable } from "./state";
import { pauseMissingProducts, replacementLine, replacementOffers, reserveReplacement } from "./stock";
import { queueBuyerChange, writeOrderChange } from "./write";

type Shop = ShopEnv["Bindings"];
const lifetime = 30 * 60_000;

function sellerMoney(actor: Seller) {
  return actor.role === "owner" || actor.permissions.includes("payments");
}

export function quoteChanges(env: Shop, actor: Seller, number: number, input: CompositionEdits) {
  return compositionQuote(
    planComposition(env, readChangeState(sellerOrderRow(env.storage, number)), input, sellerMoney(actor)),
  );
}

export function proposeChanges(
  env: Shop,
  actor: Seller,
  number: number,
  input: CompositionEdits & { quote: string },
  identity: CommandIdentity,
) {
  const { storage } = env;
  return executeCommand(storage, env.db, `composition:seller:${actor.accountId}:${number}`, identity, () => {
    const state = readChangeState(sellerOrderRow(storage, number));
    const money = sellerMoney(actor);
    const plan = compositionQuote(planComposition(env, state, input, money));
    if (input.quote !== plan.quote) throw new ApiError("QUOTE_CHANGED", "Итог изменился. Проверьте новую сумму", plan);
    const { work, snapshot } = state;
    const now = Date.now();
    const immediate = plan.lines.filter((line) => line.status === "applied");
    const proposed = plan.lines.length > immediate.length;
    if (pendingComposition(work.composition) && work.composition) {
      const replaced = new Set(plan.lines.map(({ id }) => id));
      work.composition.lines = [...work.composition.lines.filter(({ id }) => !replaced.has(id)), ...plan.lines];
    } else {
      work.composition = {
        id: crypto.randomUUID(),
        createdAt: now,
        expiresAt: proposed ? now + lifetime : null,
        originalMinor: snapshot.totalMinor,
        lines: plan.lines,
      };
    }

    applyLines(storage, state, immediate);
    const paused = pauseMissingProducts(
      env,
      immediate.flatMap(({ before }) => (before ? [before.productId] : [])),
      now,
    );
    const id = writeOrderChange(
      storage,
      state,
      actor.accountId,
      proposed ? "composition.proposed" : "composition.applied",
      { changeId: work.composition.id, lines: plan.lines },
      now,
    );
    queueBuyerChange(storage, state, id, "composition", now);
    if (paused) env.changes.catalog();
    if (proposed && work.composition.expiresAt) env.changes.orderChangeDeadline(work.composition.expiresAt);
    env.changes.order(number);
    return { status: 200, body: { revision: state.row.version, composition: orderComposition(state, money) } };
  }).body;
}

const expired = () => new ApiError("CHANGE_EXPIRED", "Предложение больше недоступно");

export function answerChanges(
  env: Shop,
  customer: string,
  number: number,
  input: CompositionAnswer,
  identity: CommandIdentity,
) {
  const { storage } = env;
  return executeCommand(storage, env.db, `composition:buyer:${customer}:${number}`, identity, () => {
    const state = readChangeState(buyerOrderRow(storage, customer, number));
    const { work } = state;
    requireChangeable(state, input.expectedVersion);
    const now = Date.now();
    const proposal = work.composition;
    if (!proposal || proposal.id !== input.changeId || !proposal.expiresAt || now >= proposal.expiresAt)
      throw expired();
    const line = proposal.lines.find((line) => line.id === input.lineId && line.status === "pending");
    if (!line?.after) throw expired();

    let updated: CompositionLine;
    const reserved = new Set<string>();
    if (input.decision === "accept") {
      const { after } = line;
      const current = replacementLine(
        env,
        replacementOffers(env, [after.variantId]).get(after.variantId),
        after.quantity,
        line.id,
      );
      if (current.totalMinor !== (input.confirmedLineMinor ?? after.totalMinor))
        throw new ApiError("QUOTE_CHANGED", "Итог изменился. Проверьте новую сумму", { line: current });
      if (reserveReplacement(env, current)) reserved.add(line.id);
      updated = {
        ...line,
        status: "accepted",
        after: current,
        deltaMinor: current.totalMinor - (line.before?.totalMinor ?? 0),
      };
    } else {
      updated = { ...line, status: "declined", after: null, deltaMinor: -(line.before?.totalMinor ?? 0) };
    }
    proposal.lines = proposal.lines.map((item) => (item.id === line.id ? updated : item));
    const stage = applyLines(storage, state, [updated], reserved);
    if (stage === "cancelled" || !pendingComposition(proposal)) proposal.expiresAt = null;
    const eventId = writeOrderChange(
      storage,
      state,
      customer,
      "composition.answered",
      { changeId: proposal.id, lines: [updated], stage },
      now,
      stage,
    );
    if (stage === "cancelled") queueBuyerChange(storage, state, eventId, "composition", now);
    env.changes.order(number);
    if (input.decision === "accept") env.changes.catalog();
    return { status: 200, body: buyerOrder(state.row) };
  }).body;
}
