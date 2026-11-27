import { expect, it } from "vitest";
import { environmentResources } from "../server/platform/config";
import { assertDatabaseTarget, assertSetupOptions, platformTarget } from "./platform-target";

it("ветка не может применять миграции или команды к demo; preview выбирает отдельную D1", () => {
  expect(() => platformTarget(false, false, "task/F10")).toThrow("Demo D1 меняет только main");
  const demo = platformTarget(false, false, "main");
  const preview = platformTarget(false, true, "task/F10");
  expect(preview.name).toBe("korzina-preview-platform");
  expect(preview.id).not.toBe(demo.id);
  expect(environmentResources(true).media).toBe("korzina-preview-media");
  expect(environmentResources(true).publicMedia).toBe("korzina-preview-media-public");
  expect(environmentResources(true).publicOrigin).not.toContain("demo.korzina.app");
  expect(() => assertDatabaseTarget(["d1", "migrations", "apply", demo.id], preview.id)).toThrow();
  expect(() => assertDatabaseTarget(["d1", "raw", demo.id], preview.id)).toThrow();
  expect(() => assertDatabaseTarget(["d1", "migrations", "apply", preview.id], preview.id)).not.toThrow();
  expect(platformTarget(true, false, "task/F10")).toEqual(demo);
});

it("L2: prod имеет отдельную D1 и R2; seed/local/preview запрещены до любых изменений", () => {
  const prod = platformTarget(false, false, "main", true);
  const resources = environmentResources(false, true);
  expect(prod.name).toBe("korzina-prod-platform");
  for (const preview of [false, true]) expect(prod.id).not.toBe(environmentResources(preview).database.id);
  expect(resources.media).toBe("korzina-prod-media");
  expect(resources.publicMedia).toBe("korzina-prod-media-public");
  expect(() => assertSetupOptions(false, false, true, true)).toThrow("seed запрещены");
  expect(() => assertSetupOptions(true, false, true, false)).toThrow();
  expect(() => assertSetupOptions(false, true, true, false)).toThrow();
  expect(() => platformTarget(false, false, "task/L2", true)).toThrow();
  expect(() => assertDatabaseTarget(["d1", "raw", environmentResources(false).database.id], prod.id)).toThrow();
  expect(() => assertSetupOptions(false, false, true, false)).not.toThrow();
});
