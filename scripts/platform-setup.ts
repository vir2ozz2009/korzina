import { featureStatement } from "../server/platform/features.ts";
import { demoSeedShopIds, requestDemoSeed, seedStatements } from "../server/platform/seed.ts";
import { applyMigrations, query } from "./platform-cli.ts";

const local = process.argv.includes("--local");
const preview = process.argv.includes("--preview");
applyMigrations(local, preview);
if (process.argv.includes("--seed"))
  query(
    [
      ...seedStatements,
      ...demoSeedShopIds.map(requestDemoSeed),
      ...(preview && process.env.WORKERS_CI_BRANCH === "feature/12-1-promo-discounts"
        ? [featureStatement("test2", "promotions", true)]
        : []),
    ],
    local,
    preview,
  );
console.log(local ? "Локальная платформа готова." : preview ? "Платформа preview готова." : "Платформа demo готова.");
