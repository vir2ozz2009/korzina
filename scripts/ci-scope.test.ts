import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyChanges } from "./ci-scope.ts";

describe("CI-FAST: выбор проверок закрыт по умолчанию", () => {
  it("полный набор включает каждый существующий spec ровно в одну группу", () => {
    const groups = classifyChanges(["unknown.ts"]).matrix.map(({ files }) => new RegExp(files));
    for (const file of readdirSync("e2e").filter((file) => file.endsWith(".spec.ts")))
      expect(groups.filter((regex) => regex.test(`e2e/${file}`)).length, file).toBe(1);
  });
  it("документы без runtime", () => {
    expect(classifyChanges(["docs/TESTING.md", "AGENTS.md"])).toEqual({ mode: "docs", matrix: [] });
  });
  it("пустой diff и удаление не обходят полный набор", () => {
    expect(classifyChanges([]).mode).toBe("full");
    expect(classifyChanges(["e2e/purchase.spec.ts"], true).mode).toBe("full");
  });
  it.each([
    "src/shared/money.ts",
    "server/platform/auth.ts",
    "server/modules/orders/routes.ts",
    "src/ui/Button.tsx",
    "src/styles/tokens.css",
    "src/features/seller/http.ts",
    "package-lock.json",
    ".github/workflows/check.yml",
    "e2e/new-helper.ts",
    "unknown.ts",
  ])("%s сохраняет полный набор, включая смешанный PR", (path) => {
    expect(classifyChanges(["docs/TESTING.md", "src/features/seller/ui/sales/StatsCard.tsx", path]).mode).toBe("full");
  });
  it("правка сценария выбирает его и общий smoke", () => {
    const result = classifyChanges(["e2e/promo-final.spec.ts"]);
    expect(result.mode).toBe("scoped");
    const selected = new RegExp(result.matrix[0].files);
    expect(selected.test("e2e/promo-final.spec.ts")).toBe(true);
    expect(selected.test("e2e/smoke.spec.ts")).toBe(true);
    expect(selected.test("e2e/telegram-login.spec.ts")).toBe(false);
  });
  it("несколько ограниченных областей объединяются", () => {
    const result = classifyChanges(["src/features/seller/ui/sales/StatsCard.tsx", "e2e/catalog.spec.ts"]);
    expect(result.mode).toBe("scoped");
    expect(new RegExp(result.matrix[0].files).test("e2e/shop-settings.spec.ts")).toBe(true);
    expect(new RegExp(result.matrix[0].files).test("e2e/catalog.spec.ts")).toBe(true);
  });
});
