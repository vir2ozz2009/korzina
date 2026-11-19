import { z } from "zod";
import { type DeliveryAddress, receivingInput } from "./receiving";

export type SavedAddress = DeliveryAddress & { id: string; title: string };
const revision = z.number().int().nonnegative();
export const profileInput = z.strictObject({
  revision,
  name: z.string().trim().max(50),
  phone: z.string().trim().max(40),
});
const identifier = z.string().min(1).max(1100);
export const addressCommand = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("save"),
    revision,
    id: identifier.optional(),
    title: z.string().trim().max(50),
    receiving: receivingInput.refine((value) => value.mode === "delivery"),
  }),
  z.strictObject({ action: z.literal("remove"), revision, id: identifier }),
]);
export type AddressCommand = z.infer<typeof addressCommand>;
