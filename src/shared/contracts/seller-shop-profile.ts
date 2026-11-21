import { z } from "zod";
import { type ShopTheme, THEME_PRESETS, validateCustomColor } from "../theme-presets";
import { pointInput } from "./receiving";
import { timezone } from "./receiving-time";

const expectedRevision = z.number().int().nonnegative();
const logo = z.strictObject({
  id: z.uuid(),
  shape: z.enum(["circle", "square", "wide"]),
});
const storeProfileInput = z.strictObject({
  name: z.string().trim().min(1).max(100),
  logo: logo.nullable(),
  address: z.string().trim().max(300).optional(),
  point: pointInput.nullable().optional(),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[\d][\d() .-]{5,24}$/u)
    .optional(),
  email: z.email().max(254).optional(),
  telegram: z
    .string()
    .trim()
    .regex(/^@?[a-zA-Z0-9_]{5,32}$/u)
    .optional(),
  timeZone: timezone,
});
export const saveStoreProfile = storeProfileInput.extend({ expectedRevision });
export const saveStoreTheme = z.strictObject({
  expectedRevision,
  theme: z.custom<ShopTheme>((candidate) => {
    if (typeof candidate !== "object" || candidate === null || Object.keys(candidate).length !== 1) return false;
    if ("custom" in candidate) return typeof candidate.custom === "string" && validateCustomColor(candidate.custom).ok;
    return "preset" in candidate && THEME_PRESETS.some(({ id }) => id === candidate.preset);
  }),
});
export type StoreProfile = z.infer<typeof storeProfileInput>;
