import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

function git(args: string[]) {
  return execFileSync("git", args, { encoding: "utf8" }).split("\0").filter(Boolean);
}
const base = process.env.TEST_BASE_REF ?? "origin/main";
// Include commits on this branch, staged/unstaged changes and newly added tests.
const ancestor = execFileSync("git", ["merge-base", base, "HEAD"], { encoding: "utf8" }).trim();
const changed = [
  ...new Set([
    ...git(["diff", "--name-only", "-z", ancestor]),
    ...git(["ls-files", "--others", "--exclude-standard", "-z"]),
  ]),
];
const files = changed.filter((file) => /\.(?:tsx?|sql)$/.test(file) && existsSync(file));
// Config, dependencies and deletions can affect every suite, beyond the import graph.
const all = changed.some(
  (file) =>
    /^(?:package(?:-lock)?\.json|(?:vitest|vite|cloudflare)\.config\.ts)$/.test(file) ||
    (/\.(?:tsx?|sql)$/.test(file) && !existsSync(file)),
);
if (!files.length && !all) {
  console.log("Нет изменённых исходников для связанных тестов.");
} else {
  // Integration tests call cloudflare:workers exports, outside Vitest's import graph.
  const workerChanged = files.some((file) => file.startsWith("server/") || file.startsWith("src/shared/"));
  const commands = all
    ? [["run"]]
    : workerChanged
      ? [
          ["related", "--run", "--project", "unit", "--passWithNoTests", ...files],
          ["run", "--project", "api"],
        ]
      : [["related", "--run", "--passWithNoTests", ...files]];
  for (const args of commands) {
    const result = spawnSync("node_modules/.bin/vitest", args, { stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      process.exitCode = result.status ?? 1;
      break;
    }
  }
}
