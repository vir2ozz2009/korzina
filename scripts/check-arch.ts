import { readdir, readFile } from "node:fs/promises";
import { inspectSource } from "./arch-rules.ts";

const ignored = new Set([".git", "node_modules", "dist", ".cloudflare", ".wrangler", "docs", ".codex"]);

const removedBotBinding = /PLATFORM_BOT_/u;
const errors: string[] = [];
const warnings: string[] = [];

async function scan(directory: string) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name) || entry.isSymbolicLink()) continue;
    const path = directory === "." ? entry.name : `${directory}/${entry.name}`;
    if (entry.isDirectory()) await scan(path);
    else if (/\.(?:[cm]?[jt]sx?|css)$/.test(path)) {
      const content = await readFile(path, "utf8");
      const result = inspectSource({ path, content });
      if ((path === "cloudflare.config.ts" || path.startsWith("server/")) && removedBotBinding.test(content))
        errors.push(`${path}: BOT1.1 · допускаются только боты магазинов`);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    }
  }
}

await scan(".");
for (const warning of warnings) console.warn(`Предупреждение: ${warning}`);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Архитектурные проверки пройдены.");
}
