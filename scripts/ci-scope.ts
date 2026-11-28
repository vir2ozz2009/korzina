import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";

const suites = {
  core: "e2e/(?!promo-|purchase\\.spec|telegram-login\\.spec)[^/]+\\.spec\\.ts$",
  promo: "e2e/promo-[^/]+\\.spec\\.ts$",
  purchase: "e2e/purchase\\.spec\\.ts$",
  telegram: "e2e/telegram-login\\.spec\\.ts$",
};
const isolated = [{ prefix: "src/features/seller/ui/sales/", files: "e2e/shop-settings\\.spec\\.ts$" }];
export function classifyChanges(paths: string[], deleted = false) {
  const runtime = paths.filter((path) => !path.startsWith("docs/") && path !== "AGENTS.md");
  if (paths.length && !runtime.length && !deleted) return { mode: "docs", matrix: [] };
  const selected = new Set<string>();
  let full = deleted || !paths.length;
  for (const path of runtime) {
    const rule = isolated.find(({ prefix }) => path.startsWith(prefix));
    // New helpers/config/shared code are deliberately not inferred from filenames.
    if (rule) selected.add(rule.files);
    else if (/^e2e\/[a-z-]+\.spec\.ts$/.test(path)) selected.add(`${path.replaceAll(".", "\\.")}$`);
    else full = true;
  }
  return {
    mode: full ? "full" : "scoped",
    matrix: full
      ? Object.entries(suites).map(([name, files]) => ({ name, files }))
      : [{ name: "affected", files: [...new Set(["e2e/smoke\\.spec\\.ts$", ...selected])].join("|") }],
  };
}

if (import.meta.main) {
  const { CI_BASE_SHA: base, CI_HEAD_SHA: head, GITHUB_OUTPUT: output } = process.env;
  if (!base || !head || !/^[a-f0-9]{40}$/.test(base) || !/^[a-f0-9]{40}$/.test(head))
    throw new Error("Нужны CI_BASE_SHA и CI_HEAD_SHA");
  const args = ["diff", "--no-renames", "--name-only", "-z", `${base}...${head}`];
  const paths = execFileSync("git", args, { encoding: "utf8" }).split("\0").filter(Boolean);
  const deleted = execFileSync("git", [...args.slice(0, 1), "--diff-filter=D", ...args.slice(1)], { encoding: "utf8" });
  const scope = classifyChanges(paths, Boolean(deleted));
  console.log(JSON.stringify({ ...scope, paths }, null, 2));
  if (output) appendFileSync(output, `mode=${scope.mode}\nmatrix=${JSON.stringify(scope.matrix)}\n`);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Объём проверок\n${scope.mode}; ${paths.length} файлов.\n`);
}
