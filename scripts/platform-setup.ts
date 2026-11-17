import { seedStatements } from "../server/platform/seed.ts";
import { applyMigrations, query } from "./platform-cli.ts";

const local = process.argv.includes("--local");
const preview = process.argv.includes("--preview");
applyMigrations(local, preview);
if (process.argv.includes("--seed")) query(seedStatements, local, preview);
console.log(local ? "Локальная платформа готова." : preview ? "Платформа preview готова." : "Платформа demo готова.");
