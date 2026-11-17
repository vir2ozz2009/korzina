import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";

const base = process.env.PR_BASE_SHA;
if (!base || !/^[a-f0-9]{40}$/.test(base)) throw new Error("Нужен PR_BASE_SHA");
const diff = execFileSync("git", ["diff", "--numstat", `${base}...HEAD`], { encoding: "utf8" });
const lines = diff.split("\n").reduce((sum, line) => {
  const [added, removed, path = ""] = line.split("\t");
  if (!/\.(?:[cm]?[jt]sx?|css|sql|ya?ml)$/.test(path) || /(?:^docs\/|\/migrations\/meta\/)/.test(path)) return sum;
  return sum + (Number(added) || 0) + (Number(removed) || 0);
}, 0);
const message = `PR: ${lines} изменённых строк кода. ${lines > 800 ? "Предупреждение: больше 800, разделите задачу (AGENTS.md §4)." : "В пределах ориентира 800."}`;
console.log(lines > 800 ? `::warning::${message}` : message);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n`);
