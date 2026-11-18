import { type Schedule, type SlotSelection, scheduleInput } from "../../../src/shared/contracts/slots";
import { day } from "../../shop/cleanup";
import { slotCalendar } from "./schedule";

export function parseSchedule(json: string | undefined): Schedule | null {
  return json ? scheduleInput.parse(JSON.parse(json)) : null;
}

function slotOccupancy(storage: DurableObjectStorage, now: number) {
  const rows = storage.sql.exec<{ start_at: number; reserved: number }>(
    "SELECT start_at,reserved FROM collection_slots WHERE start_at>? AND start_at<?",
    now,
    now + 8 * day,
  );
  return new Map([...rows].map(({ start_at, reserved }) => [start_at, reserved]));
}

export function collectionCalendar(storage: DurableObjectStorage, schedule: Schedule, now: number) {
  return slotCalendar(schedule, now, slotOccupancy(storage, now));
}

export function selectCollectionSlot(
  storage: DurableObjectStorage,
  schedule: Schedule | null,
  selection: SlotSelection,
  now: number,
) {
  if (!schedule || (selection.type === "asap" && !schedule.asap)) return;
  const calendar = collectionCalendar(storage, schedule, now);
  return calendar.days
    .flatMap(({ slots }) => slots)
    .find((slot) => slot.available && (selection.type === "asap" || selection.startAt === slot.startAt));
}
