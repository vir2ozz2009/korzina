import type { ShopChange } from "../../../src/shared/contracts/admin";
import { ApiError } from "../../../src/shared/errors";
import { flags, isFeatureKey } from "../../../src/shared/flags";
import { currencyCodes, timeZones } from "../../../src/shared/region-data";
import { THEME_PRESETS, validateCustomColor } from "../../../src/shared/theme-presets";
import type { AuthSecrets } from "../../auth/config";
import { telegramApi } from "../../auth/telegram-api";
import type { CommandIdentity } from "../../middleware/idempotency";
import { scheduleSellerCleanup } from "../cleanup";
import { auditEvent, platformReplay } from "./commands";
import { prepareOwnerInvite } from "./invitation-link";
import { slugAvailability } from "./registry";
import { type ManagedShop, managedShop } from "./shop-detail";

type PreparedChange = {
  action: string;
  changed: object;
  statements: D1PreparedStatement[];
  afterCommit?: () => Promise<void>;
};
export type ShopMutation = { id: string; actor: string; command: CommandIdentity; version: number };
const stale = () => new ApiError("VERSION_CONFLICT", "Данные магазина изменились. Обновите карточку");

export async function commitShopChange(database: D1Database, mutation: ShopMutation, change: PreparedChange) {
  const { id, actor, command, version } = mutation;
  const now = Date.now();
  const result = { id, version: version + 1 };
  try {
    await database.batch([
      database
        .prepare(`INSERT INTO platform_commands(account_id,key,fingerprint,result,created_at)
        VALUES (?,?,?,CASE WHEN EXISTS (SELECT 1 FROM shops WHERE id=? AND version=?) THEN ? END,?)`)
        .bind(actor, command.key, command.fingerprint, id, version, JSON.stringify(result), now),
      database.prepare("UPDATE shops SET version=version+1 WHERE id=?").bind(id),
      ...change.statements,
      auditEvent(database, id, actor, change.action, change.changed, now),
    ]);
  } catch (error) {
    const replay = await platformReplay<typeof result>(database, actor, command);
    if (replay) return replay;
    if ((await managedShop(database, id)).version !== version) throw stale();
    throw error;
  }
  await Promise.all([scheduleSellerCleanup().catch(() => {}), change.afterCommit?.().catch(() => {})]);
  return result;
}

export async function prepareShopChange(database: D1Database, mutation: ShopMutation) {
  const replay = await platformReplay<{ id: string; version: number }>(database, mutation.actor, mutation.command);
  if (replay) return { replay, shop: undefined };
  const shop = await managedShop(database, mutation.id);
  if (shop.version !== mutation.version) throw stale();
  return { shop, replay: undefined };
}

function statusChange(
  database: D1Database,
  shop: ManagedShop,
  next: "active" | "paused",
  bot?: string,
): PreparedChange {
  if (next === shop.status || (next === "paused" && shop.status !== "active"))
    throw new ApiError("INVALID_TRANSITION", "Переход недоступен");
  if (shop.status === "draft" && !shop.currency) throw new ApiError("VALIDATION", "Выберите валюту в данных магазина");
  return {
    action: "shop.status",
    changed: { from: shop.status, to: next },
    statements: [database.prepare("UPDATE shops SET status=?,status_notice=NULL WHERE id=?").bind(next, shop.id)],
    afterCommit: () => notifyShopStatus(database, shop, next, shop.version + 1, bot),
  };
}

export async function notifyShopStatus(
  database: D1Database,
  shop: Pick<ManagedShop, "id" | "name" | "ownerAccepted">,
  next: "active" | "paused",
  version: number,
  bot?: string,
) {
  if (!shop.ownerAccepted) return;
  const owner = await database
    .withSession("first-primary")
    .prepare(`SELECT a.telegram_id AS telegramId
    FROM memberships m JOIN accounts a ON a.id=m.account_id
    WHERE m.shop_id=? AND m.role='owner' AND m.revoked_at IS NULL LIMIT 1`)
    .bind(shop.id)
    .first<{ telegramId: string | null }>();
  if (owner?.telegramId && bot) {
    try {
      await telegramApi(bot, "sendMessage", {
        chat_id: owner.telegramId,
        text: next === "paused" ? `Магазин «${shop.name}» поставлен на паузу.` : `Магазин «${shop.name}» открыт.`,
      });
      return;
    } catch {
      /* The status command has already committed. */
    }
  }
  await database
    .prepare("UPDATE shops SET status_notice=? WHERE id=? AND version=?")
    .bind("Уведомление не отправлено: владелец не подключил Telegram", shop.id, version)
    .run();
}

async function inviteChange(
  database: D1Database,
  shop: ManagedShop,
  secrets: AuthSecrets,
  reason?: string,
): Promise<PreparedChange> {
  if (reason && !shop.ownerAccepted) throw new ApiError("INVALID_TRANSITION", "Владелец ещё не назначен");
  const now = Date.now();
  const invite = await prepareOwnerInvite(shop.id, secrets.ENCRYPTION_KEY, now, !shop.botUsername, reason);
  return {
    action: reason ? "owner.replacement_invited" : "owner.invite_issued",
    changed: reason ? { reason } : {},
    statements: [
      database.prepare("UPDATE invitations SET revoked_at=? WHERE shop_id=? AND revoked_at IS NULL").bind(now, shop.id),
      database.prepare(invite.sql).bind(...invite.params),
    ],
  };
}

async function featureChange(
  database: D1Database,
  shop: ManagedShop,
  key: string,
  enabled: boolean,
): Promise<PreparedChange> {
  if (!isFeatureKey(key)) throw new ApiError("VALIDATION", "Дополнение не найдено");
  const value = await database
    .withSession("first-primary")
    .prepare("SELECT enabled FROM feature_overrides WHERE shop_id=? AND key=?")
    .bind(shop.id, key)
    .first<{ enabled: number }>();
  const from = value ? !!value.enabled : (flags.find((flag) => flag.key === key)?.default ?? false);
  return {
    action: "shop.feature",
    changed: { key, from, to: enabled },
    statements: [
      database
        .prepare(`INSERT INTO feature_overrides(shop_id,key,enabled) VALUES(?,?,?)
      ON CONFLICT(shop_id,key) DO UPDATE SET enabled=excluded.enabled`)
        .bind(shop.id, key, +enabled),
    ],
  };
}

async function validateAddress(database: D1Database, next: string) {
  const status = await slugAvailability(database, next);
  if (!status.available) throw new ApiError(status.code, status.message);
}

async function dataChange(
  database: D1Database,
  shop: ManagedShop,
  input: Extract<ShopChange, { action: "data" }>,
  currencyLocked: boolean,
  appEnv: string,
): Promise<PreparedChange> {
  const { name, country, currency, timeZone, theme } = input;
  if (!currencyCodes.includes(currency) || !timeZones.includes(timeZone))
    throw new ApiError("VALIDATION", "Проверьте валюту и часовой пояс");
  if ("custom" in theme ? !validateCustomColor(theme.custom).ok : !THEME_PRESETS.some(({ id }) => id === theme.preset))
    throw new ApiError("VALIDATION", "Проверьте цвет оформления");
  if (currencyLocked && shop.currency && shop.currency !== currency)
    throw new ApiError("CURRENCY_LOCKED", "Валюта закреплена после первого заказа");
  const slug = input.slug ?? shop.slug;
  if (slug !== shop.slug && shop.status !== "draft")
    throw new ApiError("SLUG_LOCKED", "Адрес можно изменить только в черновике");
  const statements = [
    database
      .prepare("UPDATE shops SET name=?,slug=?,country=?,currency=?,time_zone=?,theme=? WHERE id=?")
      .bind(name, slug, country, currency, timeZone, JSON.stringify(theme), shop.id),
  ];
  if (slug !== shop.slug) {
    await validateAddress(database, slug);
    const suffix = appEnv === "production" ? "korzina.app" : "demo.korzina.app";
    statements.push(
      database
        .prepare("UPDATE domains SET host=? WHERE shop_id=? AND host=?")
        .bind(`${slug}.${suffix}`, shop.id, `${shop.slug}.${suffix}`),
    );
  }
  return {
    action: "shop.data",
    changed: {
      from: {
        name: shop.name,
        slug: shop.slug,
        country: shop.country,
        currency: shop.currency,
        timeZone: shop.timeZone,
        theme: shop.theme && JSON.parse(shop.theme),
      },
      to: { name, slug, country, currency, timeZone, theme },
    },
    statements,
  };
}

export async function changeShop(
  database: D1Database,
  mutation: ShopMutation,
  input: ShopChange,
  secrets: AuthSecrets & Pick<Env, "APP_ENV">,
  currencyLocked: boolean,
) {
  const state = await prepareShopChange(database, mutation);
  if (state.replay) return state.replay;
  const { shop } = state;
  switch (input.action) {
    case "status":
      return commitShopChange(
        database,
        mutation,
        statusChange(database, shop, input.status, secrets.PLATFORM_BOT_TOKEN),
      );
    case "invite":
      return commitShopChange(database, mutation, await inviteChange(database, shop, secrets, input.reason));
    case "feature":
      return commitShopChange(database, mutation, await featureChange(database, shop, input.key, input.enabled));
    case "data":
      try {
        const prepared = await dataChange(database, shop, input, currencyLocked, secrets.APP_ENV);
        return await commitShopChange(database, mutation, prepared);
      } catch (error) {
        if (!(error instanceof ApiError) && input.slug && input.slug !== shop.slug)
          await validateAddress(database, input.slug);
        throw error;
      }
  }
}
