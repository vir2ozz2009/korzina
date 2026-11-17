import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SqlStatement } from "../server/platform/create-shop.ts";
import { assertDatabaseTarget, platformTarget } from "./platform-target.ts";

export function databaseFor(local: boolean, preview = false) {
  const branch =
    process.env.WORKERS_CI_BRANCH || execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim();
  return platformTarget(local, preview, branch);
}

export function cf(args: string[], local: boolean, preview = false): string {
  assertDatabaseTarget(args, databaseFor(local, preview).id);
  return execFileSync("node_modules/.bin/cf", [...args, ...(local ? ["--local"] : [])], {
    stdio: ["ignore", "pipe", "inherit"],
  }).toString();
}

export function query(statements: SqlStatement[], local: boolean, preview = false): void {
  const database = databaseFor(local, preview);
  const directory = mkdtempSync(join(tmpdir(), "korzina-d1-"));
  try {
    const file = join(directory, "batch.json");
    writeFileSync(file, JSON.stringify(statements.map(({ sql, params }) => ({ sql, params: params.map(String) }))), {
      mode: 0o600,
    });
    cf(["d1", "raw", database.id, "--batch", `@${file}`], local, preview);
  } finally {
    rmSync(directory, { recursive: true });
  }
}

export function applyMigrations(local: boolean, preview = false): void {
  const database = databaseFor(local, preview);
  cf(["d1", "migrations", "apply", database.id, "--dir", "server/platform/migrations"], local, preview);
}
