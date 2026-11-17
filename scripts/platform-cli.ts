import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { platformDatabase } from "../server/platform/config.ts";
import type { SqlStatement } from "../server/platform/create-shop.ts";

export function cf(args: string[], local: boolean): string {
  return execFileSync("node_modules/.bin/cf", [...args, ...(local ? ["--local"] : [])], {
    stdio: ["ignore", "pipe", "inherit"],
  }).toString();
}

export function query(statements: SqlStatement[], local: boolean): void {
  const directory = mkdtempSync(join(tmpdir(), "korzina-d1-"));
  try {
    const file = join(directory, "batch.json");
    writeFileSync(file, JSON.stringify(statements.map(({ sql, params }) => ({ sql, params: params.map(String) }))), {
      mode: 0o600,
    });
    cf(["d1", "raw", platformDatabase.id, "--batch", `@${file}`], local);
  } finally {
    rmSync(directory, { recursive: true });
  }
}

export function applyMigrations(local: boolean): void {
  cf(["d1", "migrations", "apply", platformDatabase.id, "--dir", "server/platform/migrations"], local);
}
