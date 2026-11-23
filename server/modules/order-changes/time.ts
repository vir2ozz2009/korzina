import type { ChangeSide, TimeChange, TimeChangeInput } from "../../../src/shared/contracts/order-changes";
import type { TimeChoice } from "../../../src/shared/contracts/receiving-time";
import { ApiError } from "../../../src/shared/errors";
import { isTimeAvailable } from "../../../src/shared/receiving-hours";
import type { CommandIdentity } from "../../middleware/idempotency";
import { executeCommand } from "../../shop/commands";
import type { ShopEnv } from "../../shop/env";
import { buyerOrderRow } from "../checkout/buyer-orders";
import { releaseOrderReservation } from "../checkout/order-reservation";
import { readAvailability, readSchedule, reserveTime } from "../fulfillment/availability";
import { sellerOrderRow } from "../seller-orders/order";
import { type ChangeState, hasPendingOrderChange, readChangeState, requireChangeable } from "./state";
import { queueBuyerChange, writeOrderChange } from "./write";

type Shop = ShopEnv["Bindings"];
type Actor = { side: ChangeSide; id: string };

function stateFor(storage: DurableObjectStorage, actor: Actor, number: number) {
  return readChangeState(
    actor.side === "seller" ? sellerOrderRow(storage, number) : buyerOrderRow(storage, actor.id, number),
  );
}

function sameTime(first: TimeChoice | null, second: TimeChoice) {
  return first?.date === second.date && first.slotId === second.slotId;
}

function orderSchedule(storage: DurableObjectStorage, state: ChangeState) {
  const schedule = readSchedule(storage);
  const method = state.snapshot.receiving.mode;
  const settings = schedule?.[method];
  if (!settings || !schedule) throw new ApiError("NOT_FOUND", "Расписание недоступно");
  if (settings.mode !== "after_order") return schedule;
  return { ...schedule, [method]: { ...settings, mode: "slots" as const } };
}

function currentAvailability(storage: DurableObjectStorage, state: ChangeState, now: number) {
  const { snapshot } = state;
  return readAvailability(
    storage,
    snapshot.receiving.mode,
    now,
    orderSchedule(storage, state),
    snapshot.seatReserved !== false ? (snapshot.time ?? undefined) : undefined,
  );
}

export function timeAvailability(env: Shop, actor: Actor, number: number) {
  const state = stateFor(env.storage, actor, number);
  requireChangeable(state, state.row.version);
  return currentAvailability(env.storage, state, Date.now());
}

function setTime(storage: DurableObjectStorage, state: ChangeState, time: TimeChoice, now: number) {
  const { snapshot } = state;
  if (sameTime(snapshot.time, time)) return;
  // Releasing first also admits another window on the same day when the order itself fills the daily quota.
  // Any failure in revalidation restores the old reservation with the command transaction.
  releaseOrderReservation(storage, snapshot, false);
  snapshot.seatReserved = reserveTime(storage, snapshot.receiving.mode, time, now, orderSchedule(storage, state));
  snapshot.time = time;
}

function nextProposal(
  storage: DurableObjectStorage,
  state: ChangeState,
  actor: Actor,
  time: TimeChoice,
  now: number,
): TimeChange {
  if (sameTime(state.snapshot.time, time)) throw new ApiError("VALIDATION", "Выберите другое время");
  const available = currentAvailability(storage, state, now);
  if (!isTimeAvailable(available.mode, available.days, time)) throw new ApiError("SLOT_TAKEN", "Это время уже заняли");
  return {
    id: crypto.randomUUID(),
    by: actor.side,
    createdAt: now,
    before: state.snapshot.time,
    proposed: time,
    status: "pending",
  };
}

function getPending(state: ChangeState, changeId: string) {
  const active = state.work.timeChange;
  if (!active || active.id !== changeId || active.status !== "pending")
    throw new ApiError("CHANGE_EXPIRED", "Предложение больше недоступно");
  return active;
}

export function changeTime(env: Shop, actor: Actor, number: number, input: TimeChangeInput, identity: CommandIdentity) {
  const { storage } = env;
  return executeCommand(storage, env.db, `time:${actor.side}:${actor.id}:${number}`, identity, () => {
    const state = stateFor(storage, actor, number);
    requireChangeable(state, input.expectedVersion);
    const now = Date.now();
    let change: TimeChange;
    let previous: TimeChange | undefined;
    if (input.action === "propose") {
      if (hasPendingOrderChange(state.work)) throw new ApiError("ANOTHER_CHANGE_PENDING", "По заказу уже ждём ответа");
      change = nextProposal(storage, state, actor, input.time, now);
      if (!state.snapshot.time && actor.side === "seller") {
        setTime(storage, state, change.proposed, now);
        change.status = "accepted";
      }
    } else {
      const pending = getPending(state, input.changeId);
      if ((pending.by === actor.side) !== (input.action === "withdraw"))
        throw new ApiError("FORBIDDEN", "Действие недоступно");
      if (input.action === "counter") {
        change = nextProposal(storage, state, actor, input.time, now);
        previous = { ...pending, status: "superseded" };
      } else {
        if (input.action === "keep" && actor.side === "buyer") throw new ApiError("FORBIDDEN", "Действие недоступно");
        if (input.action === "accept") setTime(storage, state, pending.proposed, now);
        change = {
          ...pending,
          status: input.action === "accept" ? "accepted" : input.action === "keep" ? "kept" : "withdrawn",
        };
      }
    }
    state.work.timeChange = change;
    const id = writeOrderChange(
      storage,
      state,
      actor.id,
      `time.${change.status}`,
      { change, previous, timeZone: env.timeZone ?? readSchedule(storage)?.timeZone },
      now,
    );
    if (actor.side === "seller") queueBuyerChange(storage, state, id, "time", now);
    env.changes.order(number);
    return { status: 200, body: { revision: state.row.version, time: state.snapshot.time, change } };
  }).body;
}
