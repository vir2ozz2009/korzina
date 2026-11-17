import { z } from "zod";

const permissions = [
  "orders",
  "assembly",
  "chat",
  "products",
  "stock",
  "payments",
  "refunds",
  "payment_methods",
  "publish",
  "exports",
  "team",
  "bot",
] as const;
export const permissionSchema = z.enum(permissions);
export type Permission = z.infer<typeof permissionSchema>;
export const roleSchema = z.enum(["owner", "employee"]);
export type Role = z.infer<typeof roleSchema>;
export const emailStartInput = z.strictObject({
  email: z
    .email()
    .max(254)
    .transform((v) => v.trim().toLowerCase()),
});
export const emailVerifyInput = z.strictObject({ challengeId: z.uuid(), code: z.string().regex(/^\d{6}$/) });
export const telegramInput = z.strictObject({ initData: z.string().min(1).max(8192), bearer: z.boolean().optional() });
export const emptyInput = z.strictObject({});
