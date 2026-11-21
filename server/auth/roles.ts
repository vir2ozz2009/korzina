import { createMiddleware } from "hono/factory";
import { type Permission, permissionSchema, type Role, roleSchema } from "../../src/shared/contracts/auth";
import { type StaffRole, staffRole } from "../../src/shared/contracts/staff";
import { ApiError } from "../../src/shared/errors";
import { credential, sellerCookie } from "./cookies";
import { sessionLimiter } from "./session-limit";
import { tokenHash } from "./tokens";

const employeeDefaults: readonly Permission[] = ["orders", "assembly", "chat", "products", "stock"];
export function effectiveSellerPermissions(granted: Permission[], legacyEmployee: boolean) {
  return legacyEmployee ? [...new Set([...employeeDefaults, ...granted])] : granted;
}
export type Seller = { accountId: string; role: Role; teamRole?: StaffRole; permissions: Permission[] };
export type SellerEnv = { Bindings: Env; Variables: { seller: Seller; shopId: string } };

export function managesSettings(seller: Seller) {
  return seller.role === "owner" || seller.permissions.includes("shop_settings");
}

export function checkSettingsAccess(seller: Seller) {
  if (seller.teamRole && !managesSettings(seller)) throw new ApiError("FORBIDDEN", "Недостаточно прав");
}

const limitSeller = sessionLimiter();
export const authenticateSeller = createMiddleware<SellerEnv>(async (c, next) => {
  const seller = await readSeller(c.req.raw, c.env.PLATFORM, c.get("shopId"));
  c.set("seller", seller);
  limitSeller(c, `${c.get("shopId")}:${seller.accountId}`);
  await next();
});
export async function readSeller(request: Request, platform: D1Database, shopId: string): Promise<Seller> {
  const token = credential(request, sellerCookie);
  if (!token) throw new ApiError("UNAUTHORIZED", "Войдите в кабинет");
  return readSellerSession(platform, await tokenHash(token), shopId);
}

export async function readSellerSession(platform: D1Database, hash: string, shopId: string): Promise<Seller> {
  // A fresh first-primary join for EVERY request: no cached rights or replica lag after revocation.
  const row = await platform
    .withSession("first-primary")
    .prepare(`
    SELECT s.account_id AS accountId, m.role, m.permissions, m.team_role AS teamRole
    FROM seller_sessions s LEFT JOIN memberships m
    ON m.account_id = s.account_id AND m.shop_id = ? AND m.revoked_at IS NULL
    WHERE s.token_hash = ? AND s.expires_at > ?
  `)
    .bind(shopId, hash, Date.now())
    .first<{ accountId: string; role: string | null; permissions: string | null; teamRole: string | null }>();
  if (!row) throw new ApiError("UNAUTHORIZED", "Сессия недействительна");
  const role = roleSchema.safeParse(row.role);
  if (!role.success) throw new ApiError("FORBIDDEN", "Нет доступа к магазину");
  const team = staffRole.safeParse(row.teamRole);
  if (role.data === "employee" && row.teamRole !== null && !team.success)
    throw new ApiError("FORBIDDEN", "Нет доступа к магазину");
  let granted: Permission[];
  try {
    granted = permissionSchema.array().parse(JSON.parse(row.permissions ?? "[]"));
  } catch {
    throw new ApiError("FORBIDDEN", "Нет доступа к магазину");
  }
  return {
    accountId: row.accountId,
    role: role.data,
    ...(role.data === "employee" && team.success && { teamRole: team.data }),
    permissions: effectiveSellerPermissions(granted, role.data === "employee" && row.teamRole === null),
  };
}
export function requireRole(...roles: Role[]) {
  return createMiddleware<SellerEnv>(async (c, next) => {
    if (!roles.includes(c.get("seller").role)) throw new ApiError("FORBIDDEN", "Недостаточно прав");
    await next();
  });
}
export function requirePermission(permission: Permission) {
  return createMiddleware<SellerEnv>(async (c, next) => {
    const seller = c.get("seller");
    if (seller.role !== "owner" && !seller.permissions.includes(permission))
      throw new ApiError("FORBIDDEN", "Недостаточно прав");
    await next();
  });
}
