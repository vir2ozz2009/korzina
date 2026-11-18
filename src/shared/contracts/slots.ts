import { z } from "zod";

const timestamp = z.number().int().nonnegative().max(8_640_000_000_000_000);
const windowInput = z
  .object({
    weekday: z.number().int().min(0).max(6),
    from: z.number().int().min(0).max(1439),
    to: z.number().int().min(0).max(1440),
  })
  .refine(({ from, to }) => from !== to);
export const scheduleInput = z.object({
  timeZone: z.string().refine((name) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: name });
      return true;
    } catch {
      return false;
    }
  }),
  windows: z.array(windowInput).max(21),
  slotMinutes: z.number().int().min(15).max(240),
  capacity: z.number().int().min(1).max(1000),
  asap: z.boolean(),
});
export const slotSelectionInput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("asap") }),
  z.object({ type: z.literal("slot"), startAt: timestamp }),
]);
export type Schedule = z.infer<typeof scheduleInput>;
export type SlotSelection = z.infer<typeof slotSelectionInput>;
export type CollectionSlot = { startAt: number; endAt: number; available: boolean };
