import { z } from "zod";

export const pointInput = z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) });
const address = z.string().trim().min(1).max(300);
export const geocodeInput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("search"), address: address.min(3) }),
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
const detailField = z.enum(["apartment", "entrance", "floor", "intercom"]);
const deliveryPayee = z.enum(["shop", "courier"]).default("shop");
const zoneId = z.string().min(1).max(80);
export const pauseTermInput = z.enum(["hour", "day", "manual"]);
const receivingPause = z.object({
  term: pauseTermInput,
  until: z.number().int().positive().nullable(),
  startedAt: z.number().int().nonnegative(),
  showBanner: z.boolean().default(true),
  message: z.string().trim().max(140).default(""),
});

export const fulfillmentSettingsInput = z.object({
  delivery: z
    .union([
      z.object({
        mode: z.literal("map").default("map"),
        payee: deliveryPayee,
        zones: z
          .array(z.object({ id: zoneId, geometry, tariff }))
          .min(1)
          .max(30),
      }),
      z.object({
        mode: z.literal("districts"),
        payee: deliveryPayee,
        districts: z
          .array(z.object({ id: zoneId, name: z.string().trim().min(1).max(120), tariff }))
          .min(1)
          .max(100),
      }),
      z.object({ mode: z.literal("text"), payee: deliveryPayee, tariff }),
    ])
    .optional(),
  pickup: z.object({ address: z.string().min(1), hours: z.string().min(1), point: pointInput.optional() }).optional(),
  requiredDetails: z.array(detailField).max(4).default(["apartment"]),
  acceptingOrders: z.boolean().default(true),
  pauses: z.object({ delivery: receivingPause.optional(), pickup: receivingPause.optional() }).optional(),
});
const detail = z.string().trim().max(80).optional();
const comment = z.string().trim().max(500).optional();
export const receivingInput = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("delivery"),
    address,
    point: pointInput.optional(),
    districtId: zoneId.optional(),
    acceptedWithoutPoint: z.literal(true).optional(),
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
type DeliverySettings = NonNullable<FulfillmentSettings["delivery"]>;
export type DeliveryZone = Extract<DeliverySettings, { mode: "map" }>["zones"][number];
export type DeliveryAddress = Extract<Receiving, { mode: "delivery" }>;
export type DeliveryTariff = z.infer<typeof tariff>;
export type DetailField = z.infer<typeof detailField>;
export type ReceivingPause = z.infer<typeof receivingPause>;

export type ReceivingAvailability =
  | { mode: "pickup"; available: true; pickup: NonNullable<FulfillmentSettings["pickup"]> }
  | { mode: "pickup"; available: false }
  | {
      mode: "delivery";
      available: true;
      inZone: boolean | null;
      zoneId?: string;
      payee: DeliverySettings["payee"];
      tariff: DeliveryTariff["kind"];
      feeMinor: number | null;
      unverified?: true;
    }
  | {
      mode: "delivery";
      available: false;
      inZone: false | null;
      reason: "outside" | "address_required" | "district_required" | "disabled";
      pickup: FulfillmentSettings["pickup"] | null;
    };
