import { z } from "zod";

export const methodInput = z.enum(["delivery", "pickup"]);
const timeMode = z.enum(["slots", "day", "after_order"]);
export const localTime = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u);
const intervalInput = z
  .object({
    start: localTime,
    end: z.union([localTime, z.literal("24:00")]),
    capacity: z.number().int().positive().optional(),
  })
  .refine(({ start, end }) => start < end);
export const weekdays = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export const preparationInput = z.enum(["now", "hour", "two_hours", "next_day"]);
export type Preparation = z.infer<typeof preparationInput>;
const methodSchedule = z.object({
  mode: timeMode,
  days: z.partialRecord(z.enum(weekdays), z.array(intervalInput).max(24)),
  preparationMinutes: z.number().int().min(0).max(1440).default(60),
  preparation: preparationInput.optional(),
  dayCutoff: localTime.default("18:00"),
  dayCapacity: z.number().int().positive().optional(),
  closedDates: z.array(z.iso.date()).max(366).optional(),
  cutoffForSlots: z.boolean().optional(),
});
export const timezone = z.string().refine((value) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
});
export const scheduleInput = z.object({
  timeZone: timezone,
  delivery: methodSchedule.optional(),
  pickup: methodSchedule.optional(),
});

export const selectionInput = z.object({ date: z.iso.date(), slotId: z.string().max(16).optional() });
export const timeCommandInput = z.object({
  expectedRevision: z.number().int().nonnegative(),
  time: selectionInput.nullable(),
});
export type ReceivingMethod = z.infer<typeof methodInput>;
export type Schedule = z.infer<typeof scheduleInput>;
export type MethodSchedule = z.infer<typeof methodSchedule>;
export type TimeChoice = z.infer<typeof selectionInput>;
export type TimeCommand = z.infer<typeof timeCommandInput>;

export type AvailabilityDay = {
  date: string;
  available: boolean;
  reason?: "closed" | "past" | "full";
  intervals: {
    id: string;
    start: string;
    end: string;
    available: boolean;
    reason?: "past" | "full";
  }[];
};

export type StorefrontReceiving = {
  today: string;
  timeZone: string;
  refreshAt: number;
  banners: { text: string; expires: number | null }[];
  methods: {
    method: ReceivingMethod;
    mode: "after_order" | "unknown" | "day" | "slots";
    date?: string;
    start?: string;
    end?: string;
  }[];
};
