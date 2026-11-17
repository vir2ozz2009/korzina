import { execFileSync } from "node:child_process";
import { deploymentSmoke } from "./deployment-smoke.ts";

const branch =
  process.env.WORKERS_CI_BRANCH || execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim();
if (!branch || branch === "main") throw new Error("Превью загружается только для именованной ветки задачи");
// cf builds with isPreview=true, then provisions the Preview's own Shop namespace.
const output = execFileSync(
  "node_modules/.bin/cf",
  ["previews", "deploy", "--mode", "demo", "--preview-name", branch],
  {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  },
);
process.stdout.write(output);
const result: { preview_urls?: string[]; deployment_urls?: string[] } = JSON.parse(output);
const url = result.preview_urls?.[0] ?? result.deployment_urls?.[0];
if (!url) throw new Error("Cloudflare не вернул URL превью");
await deploymentSmoke(url);
