import { readdir, readFile } from "node:fs/promises";
import { inspectSource } from "./arch-rules.ts";

const ignored = new Set([".git", "node_modules", "dist", ".cloudflare", ".wrangler", "docs", ".codex"]);

const errors: string[] = [];
const warnings: string[] = [];

async function scan(directory: string) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name) || entry.isSymbolicLink()) continue;
    const path = directory === "." ? entry.name : `${directory}/${entry.name}`;
    if (entry.isDirectory()) await scan(path);
    else if (/\.(?:[cm]?[jt]sx?|css)$/.test(path)) {
      const result = inspectSource({ path, content: await readFile(path, "utf8") });
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
