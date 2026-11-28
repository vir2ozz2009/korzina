import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Run in a child so filesystem/env changes cannot leak to parallel unit tests.
function report(status: string, images = "", create = false, count = 1) {
  const cwd = mkdtempSync(join(tmpdir(), "ci-report-"));
  const module = new URL("./ci-browser-report.ts", import.meta.url).href;
  try {
    return JSON.parse(
      execFileSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `
      import Report from ${JSON.stringify(module)};
      import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
      process.env.CI_REQUIRED_IMAGES = ${JSON.stringify(images)};
      if (${create}) { mkdirSync('test-results'); writeFileSync('test-results/home.png', 'fixture'); }
      const reporter = new Report();
      if (${count}) reporter.onTestEnd({ titlePath: () => ['test'] }, { status: ${JSON.stringify(status)}, duration: 1 });
      const result = await reporter.onEnd({ status: 'passed', duration: 2 });
      console.log(JSON.stringify({ result, report: JSON.parse(readFileSync('test-results/coverage.json', 'utf8')) }));
    `,
        ],
        { cwd, encoding: "utf8", env: { ...process.env, GITHUB_STEP_SUMMARY: "" } },
      ),
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

describe("CI-FAST: полнота доказательств", () => {
  it("отсутствующий обязательный кадр блокирует зелёный итог", () => {
    expect(report("passed", "home.png").result.status).toBe("failed");
  });
  it("неожиданный skip и пустой набор блокируют итог", () => {
    expect(report("skipped").result.status).toBe("failed");
    expect(report("passed", "", false, 0).result.status).toBe("failed");
  });
  it("пройденные тесты с кадрами сохраняют успех", () => {
    expect(report("passed", "home.png", true).report.status).toBe("passed");
  });
});
