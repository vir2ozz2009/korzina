import { env, exports } from "cloudflare:workers";
import migration from "../platform/migrations/0000_platform.sql?raw";
import authMigration from "../platform/migrations/0001_awesome_hedge_knight.sql?raw";
import featureMigration from "../platform/migrations/0002_confused_squadron_supreme.sql?raw";
import mediaMigration from "../platform/migrations/0003_ambitious_patch.sql?raw";
import cleanupMigration from "../platform/migrations/0004_sticky_screwball.sql?raw";
import demoSeedMigration from "../platform/migrations/0005_demo_seed_queue.sql?raw";
import sellerExchangeMigration from "../platform/migrations/0006_seller_browser_exchanges.sql?raw";
import adminRegistryMigration from "../platform/migrations/0007_admin_registry.sql?raw";
import adminCardMigration from "../platform/migrations/0008_admin_card.sql?raw";
import { demoSeedShopIds, seedStatements } from "../platform/seed";

export async function setupPlatform() {
  await env.PLATFORM.batch(
    `${migration}--> statement-breakpoint${authMigration}--> statement-breakpoint${featureMigration}--> statement-breakpoint${mediaMigration}--> statement-breakpoint${cleanupMigration}--> statement-breakpoint${demoSeedMigration}--> statement-breakpoint${sellerExchangeMigration}--> statement-breakpoint${adminRegistryMigration}--> statement-breakpoint${adminCardMigration}`
      .split("--> statement-breakpoint")
      .map((sql) => env.PLATFORM.prepare(sql)),
  );
  await env.PLATFORM.batch(seedStatements.map(({ sql, params }) => env.PLATFORM.prepare(sql).bind(...params)));
  await Promise.all(demoSeedShopIds.map((id) => exports.Shop.get(exports.Shop.idFromName(id)).seedDemoCatalog(id)));
}
