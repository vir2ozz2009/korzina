import { seedStatements } from "../server/platform/seed.ts";
import { applyMigrations, query } from "./platform-cli.ts";

const local = process.argv.includes("--local");
applyMigrations(local);
if (process.argv.includes("--seed")) query(seedStatements, local);
console.log(local ? "Локальная платформа готова." : "Платформа demo готова.");
