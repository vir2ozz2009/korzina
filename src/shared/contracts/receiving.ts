import { z } from "zod";

export const pointInput = z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) });
const address = z.string().trim().min(3).max(300);
export const geocodeInput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("search"), address }),
  z.object({ type: z.literal("reverse"), point: pointInput }),
]);
const tariff = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("free") }),
  z.object({ kind: z.literal("fixed"), feeMinor: z.number().int().positive().max(1_000_000_000_000) }),
  z.object({ kind: z.literal("after_order") }),
]);
const geometry = z.discriminatedUnion("type", [
  z.object({ type: z.literal("radius"), center: pointInput, radiusMeters: z.number().positive().max(100_000) }),
  z.object({ type: z.literal("polygon"), points: z.array(pointInput).min(3).max(100) }),
]);
export const fulfillmentSettingsInput = z.object({
  delivery: z
    .object({
      zones: z
        .array(z.object({ id: z.string().min(1), geometry, tariff }))
        .min(1)
        .max(30),
    })
    .optional(),
  pickup: z.object({ address: z.string().min(1), hours: z.string().min(1) }).optional(),
});
const detail = z.string().trim().max(80).optional();
const comment = z.string().trim().max(500).optional();
export const receivingInput = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("delivery"),
    address,
    point: pointInput,
    apartment: detail,
    entrance: detail,
    floor: detail,
    intercom: detail,
    comment,
  }),
  z.object({ mode: z.literal("pickup"), comment }),
]);
export const receiveCommandInput = z.object({
  receiving: receivingInput,
  expectedRevision: z.number().int().nonnegative(),
  complete: z.boolean().optional(),
});
export type Point = z.infer<typeof pointInput>;
export type GeocodeInput = z.infer<typeof geocodeInput>;
export type Receiving = z.infer<typeof receivingInput>;
export type ReceiveCommand = z.infer<typeof receiveCommandInput>;
export type FulfillmentSettings = z.infer<typeof fulfillmentSettingsInput>;
export type DeliveryZone = NonNullable<FulfillmentSettings["delivery"]>["zones"][number];
