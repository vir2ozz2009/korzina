import { readdir, readFile } from "node:fs/promises";
import { inspectSource } from "./arch-rules.ts";

const ignored = new Set([".git", "node_modules", "dist", ".cloudflare", ".wrangler", "docs", ".codex"]);

async function scan(directory: string): Promise<string[]> {
  const errors: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name) || entry.isSymbolicLink()) continue;
    const path = directory === "." ? entry.name : `${directory}/${entry.name}`;
    if (entry.isDirectory()) errors.push(...(await scan(path)));
    else if (/\.(?:[cm]?[jt]sx?|css)$/.test(path)) {
      errors.push(...inspectSource({ path, content: await readFile(path, "utf8") }));
    }
  }
  return errors;
}

const errors = await scan(".");
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Архитектурные проверки пройдены.");
}
