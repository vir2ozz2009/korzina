import { demoSeedShopIds, requestDemoSeed, seedStatements } from "../server/platform/seed.ts";
import { applyMigrations, query } from "./platform-cli.ts";

import { assertSetupOptions } from "./platform-target.ts";

const local = process.argv.includes("--local");
const preview = process.argv.includes("--preview");
const production = process.argv.includes("--prod");
assertSetupOptions(local, preview, production, process.argv.includes("--seed"));
applyMigrations(local, preview, production);
if (process.argv.includes("--seed"))
  query([...seedStatements, ...demoSeedShopIds.map(requestDemoSeed)], local, preview);
console.log(
  production
    ? "Платформа prod готова без seed."
    : local
      ? "Локальная платформа готова."
      : preview
        ? "Платформа preview готова."
        : "Платформа demo готова.",
);
