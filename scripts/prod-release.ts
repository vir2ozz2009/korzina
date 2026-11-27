import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { environmentResources } from "../server/platform/config.ts";

const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
const args = process.argv.slice(2);
const sha = args[0] === "--sha" && args.length === 2 ? args[1] : "";
if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error("Использование: npm run release:prepare -- --sha <40-char SHA>");
if (git("rev-parse", "HEAD") !== sha || git("status", "--porcelain"))
  throw new Error("Нужен чистый checkout указанного SHA");
git("fetch", "origin", "main");
if (git("rev-parse", "origin/main") !== sha || git("branch", "--show-current") !== "main")
  throw new Error("Release candidate должен быть текущим origin/main");
execFileSync("npm", ["run", "build:prod"], { stdio: "inherit" });
execFileSync("node", ["scripts/check-bundle.ts", "--prod"], { stdio: "inherit" });
const artifact = JSON.parse(readFileSync(".cloudflare/output/v1/workers/default/worker.config.json", "utf8"));
const resources = environmentResources(false, true);
if (
  artifact.name !== "korzina-prod" ||
  artifact.env.APP_ENV.value !== "production" ||
  artifact.env.PLATFORM.id !== resources.database.id ||
  artifact.env.MEDIA.name !== resources.media ||
  artifact.env.MEDIA_PUBLIC.name !== resources.publicMedia ||
  JSON.stringify(artifact.domains) !== JSON.stringify(["prod.korzina.app"])
)
  throw new Error("Production artifact target mismatch");
mkdirSync(".cloudflare/release", { recursive: true });
writeFileSync(
  ".cloudflare/release/candidate.json",
  JSON.stringify(
    {
      sha,
      worker: "korzina-prod",
      resources: environmentResources(false, true),
      preparedAt: new Date().toISOString(),
      published: false,
    },
    null,
    2,
  ),
);
console.log(
  "Release candidate подготовлен. Миграции, секреты, домены и deploy НЕ выполнялись. Выпуск приостановлен решением Андрея.",
);
