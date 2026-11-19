import { z } from "zod";
import { countryDefaults } from "../region-data";
import { shopSlugError } from "../shop-slug";

export type AdminShopStatus = "draft" | "active" | "paused";
export const shopDraftInput = z.strictObject({
  name: z.string().trim().min(1).max(120),
  slug: z.string().max(63),
  country: z.string().refine((country) => Object.hasOwn(countryDefaults, country)),
});
export type ShopDraftInput = z.infer<typeof shopDraftInput>;
export const slugProblem = (slug: string) => {
  const code = shopSlugError(slug);
  if (!code) return undefined;
  return {
    code,
    message:
      code === "SLUG_RESERVED"
        ? "Этот адрес зарезервирован"
        : "Адрес: 3–30 латинских букв, цифр или дефисов без дефиса по краям",
  };
};

const version = z.number().int().nonnegative();
const stage = z.enum(["active", "paused"]);
export const shopChange = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("status"), version, status: stage }),
  z.strictObject({ action: z.literal("invite"), version, reason: z.string().trim().min(1).max(300).optional() }),
  z.strictObject({ action: z.literal("feature"), version, key: z.string().min(1).max(64), enabled: z.boolean() }),
  z.strictObject({
    action: z.literal("data"),
    version,
    name: shopDraftInput.shape.name,
    slug: shopDraftInput.shape.slug.optional(),
    country: shopDraftInput.shape.country,
    currency: z.string().regex(/^[A-Z]{3}$/),
    timeZone: z.string().min(1).max(64),
    theme: z.union([
      z.strictObject({ preset: z.string().max(24) }),
      z.strictObject({ custom: z.string().regex(/^#[0-9a-fA-F]{6}$/) }),
    ]),
  }),
]);
export type ShopChange = z.infer<typeof shopChange>;
export const botChange = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("connect"), version, token: z.string().trim().min(1).max(128) }),
  z.strictObject({ action: z.literal("disconnect"), version }),
]);
export type BotChange = z.infer<typeof botChange>;
