import { platformDatabase } from "../server/platform/config.ts";
import { featureStatement } from "../server/platform/features.ts";
import { flagOptions } from "./flag-options.ts";
import { applyMigrations, cf, query } from "./platform-cli.ts";

try {
  const { shop, key, enabled, local } = flagOptions(process.argv.slice(2));
  applyMigrations(local);
  // SQL arguments stay in the protected batch file; a typo must fail instead of reporting success.
  const result = JSON.parse(
    cf(["d1", "raw", platformDatabase.id, "--sql", "SELECT id FROM shops WHERE slug = ?", "--params", shop], local),
  );
  if (result[0]?.success !== true || result[0]?.results?.rows?.length !== 1) throw new Error("Магазин не найден");
  query([featureStatement(shop, key, enabled)], local);
  console.log(JSON.stringify({ shop, key, enabled }));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Не удалось изменить флаг");
  process.exitCode = 1;
}
