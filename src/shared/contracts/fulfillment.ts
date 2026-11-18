import { z } from "zod";

export const pointInput = z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) });
export const geocodeInput = z.object({ address: z.string().trim().min(3).max(300) });
const amount = z.number().int().nonnegative().max(1_000_000_000_000);
const tariff = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("store"), amountMinor: amount }),
  z.object({ kind: z.literal("courier"), amountMinor: amount }),
  z.object({ kind: z.literal("unknown") }),
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
export const deliveryAddressInput = geocodeInput.extend({ point: pointInput });
export const fulfillmentInput = z.discriminatedUnion("mode", [
  deliveryAddressInput.extend({ mode: z.literal("delivery") }),
  z.object({ mode: z.literal("pickup") }),
]);

export type Point = z.infer<typeof pointInput>;
export type DeliveryAddress = z.infer<typeof deliveryAddressInput>;
export type Fulfillment = z.infer<typeof fulfillmentInput>;
export type FulfillmentSettings = z.infer<typeof fulfillmentSettingsInput>;
export type DeliveryZone = NonNullable<FulfillmentSettings["delivery"]>["zones"][number];
