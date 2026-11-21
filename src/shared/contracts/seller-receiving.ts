import { z } from "zod";
import { fulfillmentSettingsInput, geocodeInput, pauseTermInput, receivingInput } from "./receiving.ts";
import { localTime, methodInput, preparationInput, weekdays } from "./receiving-time.ts";

const expectedRevision = z.number().int().nonnegative();
const positive = z.number().int().positive().max(100_000);
const hours = z
  .object({ start: localTime, end: z.union([localTime, z.literal("24:00")]), capacity: positive.optional() })
  .refine(({ start, end }) => start < end);
const dayHours = z
  .array(hours)
  .max(24)
  .refine((ranges) => {
    const sorted = ranges.toSorted((a, b) => a.start.localeCompare(b.start));
    return sorted.every((range, index) => !index || sorted[index - 1].end <= range.start);
  }, "Часы работы пересекаются");

const hoursInput = z
  .object({
    days: z
      .partialRecord(z.enum(weekdays), dayHours)
      .describe("Часы работы по дням недели. Один диапазон на рабочий день"),
    interval: z.enum(["1", "2", "3", "day", "after_order", "custom"]).default("2"),
    capacity: positive.optional(),
    dayCapacity: positive.optional(),
    preparationMinutes: z.number().int().min(0).max(1440).default(60),
    preparation: preparationInput
      .optional()
      .describe("Срок подготовки заказа: сразу, час, два часа или следующий рабочий день"),
    dayCutoff: localTime.default("18:00"),
  })
  .refine(
    ({ preparation, interval, days }) =>
      !preparation || (interval !== "custom" && Object.values(days).every((ranges) => ranges.length <= 1)),
    "Выберите один диапазон часов в день",
  );

const delivery = fulfillmentSettingsInput.shape.delivery;
const fulfillment = z.strictObject({
  delivery,
  pickup: fulfillmentSettingsInput.shape.pickup,
  requiredDetails: fulfillmentSettingsInput.shape.requiredDetails,
});

export const saveReceivingSettings = fulfillment.extend({
  expectedRevision,
  minimumMinor: z.number().int().nonnegative().max(1_000_000_000_000),
});
export const saveReceivingHours = z.strictObject({
  expectedRevision,
  delivery: hoursInput,
  pickup: hoursInput.optional(),
  closedDates: z.array(z.iso.date()).max(366),
});
const pauseMethods = z
  .array(methodInput)
  .min(1)
  .max(2)
  .refine((methods) => new Set(methods).size === methods.length);
export const saveReceivingPause = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("pause"),
    expectedRevision,
    methods: pauseMethods,
    term: pauseTermInput,
    message: z.string().trim().max(140).default(""),
    showBanner: z.boolean().default(true),
  }),
  z.strictObject({ action: z.literal("resume"), expectedRevision, methods: pauseMethods }),
]);
export const sellerDeliveryCheck = z.strictObject({
  delivery,
  receiving: receivingInput,
  geocode: geocodeInput.optional(),
});
export const sellerCityInput = z.strictObject({ city: z.string().trim().min(2).max(100) });

export type SaveReceivingSettings = z.infer<typeof saveReceivingSettings>;
export type SaveReceivingHours = z.infer<typeof saveReceivingHours>;
export type SaveReceivingPause = z.infer<typeof saveReceivingPause>;
export type ReceivingHours = z.infer<typeof hoursInput>;
