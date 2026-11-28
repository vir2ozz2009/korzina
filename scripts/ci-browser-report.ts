import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import type { FullResult, Reporter, TestCase, TestResult } from "@playwright/test/reporter";

// One report per isolated job. Unexpected skips never count as completed coverage.
export default class BrowserReport implements Reporter {
  private tests: { title: string; duration: number; status: string }[] = [];
  onTestEnd(test: TestCase, result: TestResult) {
    this.tests.push({ title: test.titlePath().join(" › "), duration: result.duration, status: result.status });
  }
  async onEnd(result: FullResult) {
    const required = (process.env.CI_REQUIRED_IMAGES ?? "").split(",").filter(Boolean);
    const missing = required.filter((file) => !existsSync(`test-results/${file}`));
    const skipped = this.tests.filter((test) => test.status === "skipped");
    const invalid = missing.length > 0 || skipped.length > 0 || this.tests.length === 0;
    const report = {
      sha: process.env.PR_HEAD_SHA || process.env.GITHUB_SHA,
      environment: process.env.E2E_BASE_URL || "local",
      durationMs: result.duration,
      status: invalid ? "failed" : result.status,
      missing,
      skipped: skipped.map((test) => test.title),
      tests: this.tests,
    };
    mkdirSync("test-results", { recursive: true });
    writeFileSync("test-results/coverage.json", JSON.stringify(report, null, 2));
    if (process.env.GITHUB_STEP_SUMMARY) {
      const slow = [...this.tests].sort((a, b) => b.duration - a.duration).slice(0, 5);
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        `### Браузер: ${report.status}\nSHA: ${report.sha}; среда: ${report.environment}\n\n` +
          `Всего: ${(result.duration / 1000).toFixed(1)} с; тестов: ${this.tests.length}; skips: ${skipped.length}.\n\n` +
          slow.map((test) => `- ${(test.duration / 1000).toFixed(1)} с — ${test.title}\n`).join("") +
          (missing.length ? `\nОтсутствуют кадры: ${missing.join(", ")}\n` : ""),
      );
    }
    return invalid ? { status: "failed" as const } : undefined;
  }
}
