import { env } from "cloudflare:workers";
import migration from "../platform/migrations/0000_platform.sql?raw";
import authMigration from "../platform/migrations/0001_awesome_hedge_knight.sql?raw";
import { seedStatements } from "../platform/seed";

export async function setupPlatform() {
  await env.PLATFORM.batch(
    `${migration}--> statement-breakpoint${authMigration}`
      .split("--> statement-breakpoint")
      .map((sql) => env.PLATFORM.prepare(sql)),
  );
  await env.PLATFORM.batch(seedStatements.map(({ sql, params }) => env.PLATFORM.prepare(sql).bind(...params)));
}
