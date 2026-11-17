import { expect, it } from "vitest";
import { environmentResources } from "../server/platform/config";
import { assertDatabaseTarget, platformTarget } from "./platform-target";

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
