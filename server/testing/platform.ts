import { env } from "cloudflare:workers";
import migration from "../platform/migrations/0000_platform.sql?raw";
import authMigration from "../platform/migrations/0001_awesome_hedge_knight.sql?raw";
import featureMigration from "../platform/migrations/0002_confused_squadron_supreme.sql?raw";
import mediaMigration from "../platform/migrations/0003_ambitious_patch.sql?raw";
import { seedStatements } from "../platform/seed";

export async function setupPlatform() {
  await env.PLATFORM.batch(
    `${migration}--> statement-breakpoint${authMigration}--> statement-breakpoint${featureMigration}--> statement-breakpoint${mediaMigration}`
      .split("--> statement-breakpoint")
      .map((sql) => env.PLATFORM.prepare(sql)),
  );
  await env.PLATFORM.batch(seedStatements.map(({ sql, params }) => env.PLATFORM.prepare(sql).bind(...params)));
}
