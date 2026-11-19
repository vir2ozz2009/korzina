import { type AdminShopStatus, type ShopDraftInput, slugProblem } from "../../../src/shared/contracts/admin";
import { ApiError } from "../../../src/shared/errors";
import { countryDefaults } from "../../../src/shared/region-data";
import { DEFAULT_THEME } from "../../../src/shared/theme-presets";
import type { AuthSecrets } from "../../auth/config";
import type { CommandIdentity } from "../../middleware/idempotency";
import { scheduleSellerCleanup } from "../cleanup";
import { shopRecord, shopStatements } from "../create-shop";
import { auditEvent, commandResult, platformReplay } from "./commands";
import { prepareOwnerInvite } from "./invitation-link";

const day = 24 * 60 * 60 * 1000;

type RegistryShop = {
  id: string;
  name: string;
  slug: string;
  status: AdminShopStatus;
  storefrontUrl: string;
  botConnected: number;
  ownerAccepted: number;
  orders7d: number;
};

export function storefrontUrl(request: Request, appEnv: string, slug: string) {
  const incoming = new URL(request.url);
  const url = new URL("/", incoming);
  if (appEnv !== "production") url.searchParams.set("shop", slug);
  else url.hostname = `${slug}.korzina.app`;
  return url.href;
}

export async function registry(database: D1Database, request: Request, appEnv: string) {
  const result = await database
    .withSession("first-primary")
    .prepare(`
    WITH recent AS (
      SELECT shop_id, COUNT(*) AS orders7d FROM platform_order_events WHERE created_at>=? GROUP BY shop_id
    )
    SELECT s.id, s.name, s.slug, s.status, s.bot_username IS NOT NULL AS botConnected,
    EXISTS(SELECT 1 FROM memberships m WHERE m.shop_id=s.id AND m.role='owner' AND m.revoked_at IS NULL) AS ownerAccepted,
    COALESCE(r.orders7d,0) AS orders7d
    FROM shops s LEFT JOIN recent r ON s.id=r.shop_id
    WHERE s.status IN ('draft','active','paused')
    ORDER BY s.created_at DESC, s.id`)
    .bind(Date.now() - 7 * day)
    .all<RegistryShop>();
  return result.results.map((shop) => ({
    ...shop,
    storefrontUrl: storefrontUrl(request, appEnv, shop.slug),
    botConnected: !!shop.botConnected,
    ownerAccepted: !!shop.ownerAccepted,
  }));
}

export async function slugAvailability(database: D1Database, slug: string) {
  const problem = slugProblem(slug);
  if (problem) return { available: false as const, ...problem };
  if (await database.withSession("first-primary").prepare("SELECT 1 FROM shops WHERE slug=?").bind(slug).first())
    return { available: false as const, code: "SLUG_TAKEN" as const, message: "Адрес уже занят" };
  return { available: true as const };
}

export async function createDraft(
  database: D1Database,
  env: AuthSecrets & Pick<Env, "APP_ENV">,
  accountId: string,
  command: CommandIdentity,
  input: ShopDraftInput,
) {
  const prior = await platformReplay<{ id: string }>(database, accountId, command);
  if (prior) return prior;
  const availability = await slugAvailability(database, input.slug);
  if (!availability.available) {
    const replay = await platformReplay<{ id: string }>(database, accountId, command);
    if (replay) return replay;
    throw new ApiError(availability.code, availability.message);
  }
  const shop = shopRecord(input.slug, input.name);
  const [currency, timeZone] = countryDefaults[input.country];
  const host = `${shop.slug}.${env.APP_ENV === "production" ? "" : "demo."}korzina.app`;
  const invite = await prepareOwnerInvite(shop.id, env.ENCRYPTION_KEY, shop.createdAt, true);
  const result = { id: shop.id };
  try {
    await database.batch([
      commandResult(database, accountId, command, result, shop.createdAt),
      ...shopStatements(shop, "draft", host).map(({ sql, params }) => database.prepare(sql).bind(...params)),
      database
        .prepare("UPDATE shops SET country=?,currency=?,time_zone=?,theme=? WHERE id=?")
        .bind(input.country, currency || null, timeZone, JSON.stringify(DEFAULT_THEME), shop.id),
      database.prepare(invite.sql).bind(...invite.params),
      auditEvent(
        database,
        shop.id,
        accountId,
        "shop.created",
        { country: input.country, slug: shop.slug },
        shop.createdAt,
      ),
    ]);
  } catch (error) {
    const replay = await platformReplay<{ id: string }>(database, accountId, command);
    if (replay) return replay;
    if (!(await slugAvailability(database, input.slug)).available) throw new ApiError("SLUG_TAKEN", "Адрес уже занят");
    throw error;
  }
  await scheduleSellerCleanup();
  return result;
}
