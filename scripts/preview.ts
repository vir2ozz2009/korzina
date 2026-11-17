import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const branch =
  process.env.WORKERS_CI_BRANCH ?? execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim();
if (!branch || branch === "main") throw new Error("Превью загружается только для именованной ветки задачи");
const prefix = branch
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "")
  .slice(0, 32);
const alias = `${prefix || "branch"}-${createHash("sha256").update(branch).digest("hex").slice(0, 8)}`;
execFileSync("node_modules/.bin/cf", ["workers", "versions", "create", "--prebuilt", "--preview-alias", alias], {
  stdio: "inherit",
});
