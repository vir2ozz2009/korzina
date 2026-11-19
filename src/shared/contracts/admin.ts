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
