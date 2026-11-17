import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { deploymentSmoke } from "./deployment-smoke.ts";

const branch =
  process.env.WORKERS_CI_BRANCH || execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim();
if (!branch || branch === "main") throw new Error("Превью загружается только для именованной ветки задачи");
const worker: { name?: string; env?: { APP_ENV?: { value?: string } } } = JSON.parse(
  readFileSync(".cloudflare/output/v1/workers/default/worker.config.json", "utf8"),
);
if (worker.name !== "korzina-demo" || worker.env?.APP_ENV?.value !== "demo") {
  throw new Error("Для превью нужен demo-артефакт Worker korzina-demo");
}
const prefix = branch
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "")
  .slice(0, 32);
const alias = `${prefix || "branch"}-${createHash("sha256").update(branch).digest("hex").slice(0, 8)}`;
execFileSync(
  "node_modules/.bin/cf",
  [
    "workers",
    "versions",
    "create",
    "--prebuilt",
    "--preview-alias",
    alias,
    ...(process.argv.includes("--dry-run") ? ["--dry-run"] : []),
  ],
  {
    stdio: "inherit",
    // Builds supplies a separate Preview identity by default. Our architecture uses
    // Version URLs on the existing demo Worker: retain the CLI's exact tag check.
    env: {
      ...process.env,
      CLOUDFLARE_CI_OVERRIDE_WORKER_NAME: "korzina-demo",
      CLOUDFLARE_CI_MATCH_WORKER_TAG: "b669f60f37d6452cbaaf57b01c750396",
    },
  },
);
if (!process.argv.includes("--dry-run")) {
  await deploymentSmoke(`https://${alias}-korzina-demo.vir2ozz2009.workers.dev`);
}
