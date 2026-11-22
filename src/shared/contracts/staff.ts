import { z } from "zod";
import { type Permission, permissionSchema } from "./auth";

export const staffRole = z.enum(["manager", "picker", "accountant", "custom"]);
export const teamRole = z.enum(["owner", ...staffRole.options]);
export type StaffRole = z.infer<typeof staffRole>;
export type TeamRole = z.infer<typeof teamRole>;

const manualSection = z.enum(["orders", "payments", "products"]);
type ManualSection = z.infer<typeof manualSection>;

export const staffAccess = z.union([
  z.strictObject({ role: staffRole.exclude(["custom"]) }),
  z.strictObject({
    role: z.literal("custom"),
    sections: z.array(manualSection).max(manualSection.options.length),
  }),
]);
export type StaffAccess = z.infer<typeof staffAccess>;

const sectionPermissions: Record<ManualSection, readonly Permission[]> = {
  orders: ["orders", "assembly", "chat"],
  payments: ["payments", "refunds"],
  products: ["products", "stock"],
};
const presetPermissions: Record<Exclude<StaffRole, "custom">, readonly Permission[]> = {
  manager: [
    ...sectionPermissions.orders,
    ...sectionPermissions.payments,
    ...sectionPermissions.products,
    "payment_methods",
    "publish",
    "shop_settings",
    "shop_audit",
    "bot",
  ],
  picker: sectionPermissions.orders,
  accountant: ["orders", "chat", ...sectionPermissions.payments],
};

export function staffPermissions(access: StaffAccess): Permission[] {
  if (access.role === "custom") return [...new Set(access.sections.flatMap((section) => sectionPermissions[section]))];
  return [...presetPermissions[access.role]];
}

const teamMember = z.strictObject({
  id: z.string(),
  name: z.string(),
  role: teamRole,
  permissions: permissionSchema.array(),
  version: z.int().nonnegative(),
});
const staffInvite = z.strictObject({
  id: z.uuid(),
  role: staffRole,
  state: z.enum(["pending", "accepted", "expired", "revoked"]),
  expiresAt: z.int().nonnegative(),
  url: z.url().optional(),
});
export type TeamMember = z.infer<typeof teamMember>;
export type StaffInvite = z.infer<typeof staffInvite>;
export const staffVersion = z.strictObject({ version: z.int().nonnegative() });
export const staffUpdate = z.strictObject({ version: staffVersion.shape.version, access: staffAccess });

export const notificationTopic = z.enum(["newOrders", "paymentsAndReceipts", "cancellations", "lowStock"]);
export type NotificationTopic = z.infer<typeof notificationTopic>;
export const notificationChange = z.strictObject({ role: teamRole, topic: notificationTopic, enabled: z.boolean() });
