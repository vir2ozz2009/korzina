import type { ShopChange } from "../../../src/shared/contracts/admin";
import { ApiError } from "../../../src/shared/errors";
import { isFeatureKey } from "../../../src/shared/flags";
import { currencyCodes, timeZones } from "../../../src/shared/region-data";
import { THEME_PRESETS, validateCustomColor } from "../../../src/shared/theme-presets";
import type { AuthSecrets } from "../../auth/config";
import { telegramApi } from "../../auth/telegram-api";
import type { CommandIdentity } from "../../middleware/idempotency";
import { auditEvent, platformReplay } from "./commands";
import { prepareOwnerInvite } from "./invitation-link";
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
  await change.afterCommit?.().catch(() => {});
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
    afterCommit: async () => {
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
        .bind("Уведомление не отправлено: владелец не подключил Telegram", shop.id, shop.version + 1)
        .run();
    },
  };
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

function featureChange(database: D1Database, shop: ManagedShop, key: string, enabled: boolean): PreparedChange {
  if (!isFeatureKey(key)) throw new ApiError("VALIDATION", "Дополнение не найдено");
  return {
    action: "shop.feature",
    changed: { key, enabled },
    statements: [
      database
        .prepare(`INSERT INTO feature_overrides(shop_id,key,enabled) VALUES(?,?,?)
      ON CONFLICT(shop_id,key) DO UPDATE SET enabled=excluded.enabled`)
        .bind(shop.id, key, +enabled),
    ],
  };
}

function dataChange(
  database: D1Database,
  shop: ManagedShop,
  input: Extract<ShopChange, { action: "data" }>,
  currencyLocked: boolean,
): PreparedChange {
  const { name, country, currency, timeZone, theme } = input;
  if (!currencyCodes.includes(currency) || !timeZones.includes(timeZone))
    throw new ApiError("VALIDATION", "Проверьте валюту и часовой пояс");
  if ("custom" in theme ? !validateCustomColor(theme.custom).ok : !THEME_PRESETS.some(({ id }) => id === theme.preset))
    throw new ApiError("VALIDATION", "Проверьте цвет оформления");
  if (currencyLocked && shop.currency && shop.currency !== currency)
    throw new ApiError("CURRENCY_LOCKED", "Валюта закреплена после первой финансовой операции");
  return {
    action: "shop.data",
    changed: { name, country, currency, timeZone, theme },
    statements: [
      database
        .prepare("UPDATE shops SET name=?,country=?,currency=?,time_zone=?,theme=? WHERE id=?")
        .bind(name, country, currency, timeZone, JSON.stringify(theme), shop.id),
    ],
  };
}

export async function changeShop(
  database: D1Database,
  mutation: ShopMutation,
  input: ShopChange,
  secrets: AuthSecrets,
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
      return commitShopChange(database, mutation, featureChange(database, shop, input.key, input.enabled));
    case "data":
      return commitShopChange(database, mutation, dataChange(database, shop, input, currencyLocked));
  }
}
