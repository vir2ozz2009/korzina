import type { AdminShopStatus } from "../../../src/shared/contracts/admin";
import { ApiError } from "../../../src/shared/errors";
import { flags, resolveFeatures } from "../../../src/shared/flags";
import { normalizeTheme } from "../../../src/shared/theme-presets";
import type { AuthSecrets } from "../../auth/config";
import { ensureInitialOwnerInvite, invitationToken, type OwnerInvite, readOwnerInvite } from "./invitation-link";
import { storefrontUrl } from "./registry";

export type ManagedShop = {
  id: string;
  name: string;
  slug: string;
  status: AdminShopStatus;
  version: number;
  country: string | null;
  currency: string | null;
  timeZone: string | null;
  theme: string | null;
  botUsername: string | null;
  ownerName: string | null;
  statusNotice: string | null;
  ownerAccepted: number;
};

export async function managedShop(database: D1Database, id: string) {
  const row = await database
    .withSession("first-primary")
    .prepare(`SELECT s.id,s.name,s.slug,s.status,s.version,
    s.country,s.currency,s.time_zone AS timeZone,s.theme,s.bot_username AS botUsername,s.owner_name AS ownerName,s.status_notice AS statusNotice,
    EXISTS(SELECT 1 FROM memberships m WHERE m.shop_id=s.id AND m.role='owner' AND m.revoked_at IS NULL) AS ownerAccepted
    FROM shops s WHERE id=? AND status IN ('draft','active','paused')`)
    .bind(id)
    .first<ManagedShop>();
  if (!row) throw new ApiError("SHOP_NOT_FOUND", "Магазин не найден");
  return row;
}

export async function shopDetail(
  database: D1Database,
  env: AuthSecrets & Pick<Env, "APP_ENV">,
  request: Request,
  shop: ManagedShop,
  productCount: number,
  actorId: string,
) {
  const { id } = shop;
  const now = Date.now();
  const day = 86_400_000;
  const [invitation, overrides, counts] = await database.withSession("first-primary").batch([
    readOwnerInvite(database, id),
    database.prepare("SELECT key, enabled FROM feature_overrides WHERE shop_id=?").bind(id),
    database
      .prepare(`SELECT COUNT(*) AS orders30d, COALESCE(SUM(created_at>=?),0) AS orders7d
      FROM platform_order_events WHERE shop_id=? AND created_at>=?`)
      .bind(now - 7 * day, id, now - 30 * day),
  ]);
  const username = shop.botUsername ?? env.PLATFORM_BOT_USERNAME;
  const bot = username && /^[a-z][a-z0-9_]{4,31}$/i.test(username) ? username : undefined;
  const invite =
    (invitation.results[0] as OwnerInvite | undefined) ??
    (!shop.ownerAccepted && bot && env.ENCRYPTION_KEY
      ? await ensureInitialOwnerInvite(database, id, actorId, env.ENCRYPTION_KEY, now)
      : undefined);
  const url =
    invite && invite.expiresAt > now && bot
      ? `https://t.me/${bot}?start=inv_${await invitationToken(invite.linkId, env.ENCRYPTION_KEY)}`
      : null;
  const features = resolveFeatures(
    (overrides.results as { key: string; enabled: number }[]).map(({ key, enabled }) => ({
      key: String(key),
      enabled: !!enabled,
    })),
  );
  const totals = counts.results[0] as { orders7d: number; orders30d: number } | undefined;
  return {
    ...shop,
    ownerAccepted: !!shop.ownerAccepted,
    theme: normalizeTheme(shop.theme ? JSON.parse(shop.theme) : undefined),
    storefrontUrl: storefrontUrl(request, env.APP_ENV, shop.slug),
    invite: { url, replacing: !!invite?.reason && !invite.usedBy, expiresAt: invite?.expiresAt ?? null },
    flags: flags.map(({ key, description }) => ({ key, description, enabled: features[key] })),
    productCount,
    orders7d: Number(totals?.orders7d ?? 0),
    orders30d: Number(totals?.orders30d ?? 0),
  };
}
