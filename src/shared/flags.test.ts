import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { type FeatureKey, featureEnabled, flags, resolveFeatures } from "./flags";
import { FeatureProvider, useFeature } from "./useFeature";

function Entry() {
  return useFeature("cashback") ? createElement("a", { href: "/cashback" }, "Кешбэк") : null;
}

describe("реестр функций и клиент", () => {
  it("NEW_FEATURE §3: default применяется независимо от типа, индивидуальный off имеет приоритет", () => {
    const defaults = { cashback: false, maps: true, promotions: true };
    expect(resolveFeatures([])).toEqual(defaults);
    expect(resolveFeatures([{ key: "promotions", enabled: false }])).toEqual({ ...defaults, promotions: false });
    expect(flags.some((flag) => String(flag.key) === "catalog")).toBe(false);
    expect(featureEnabled(defaults, "unknown" as FeatureKey)).toBe(false);
    expect(resolveFeatures([{ key: "removed", enabled: true }])).toEqual(defaults);
  });

  it("rollout использует default; явный off побеждает true и явный on побеждает false", () => {
    const registry = [
      { key: "pilot", kind: "rollout" as const, default: false, description: "test" },
      { key: "released", kind: "rollout" as const, default: true, description: "test" },
    ];
    expect(resolveFeatures([], registry)).toEqual({ pilot: false, released: true });
    expect(
      resolveFeatures(
        [
          { key: "pilot", enabled: true },
          { key: "released", enabled: false },
        ],
        registry,
      ),
    ).toEqual({ pilot: true, released: false });
  });

  it("useFeature скрывает вход до загрузки, после off и для соседнего магазина", () => {
    const render = (enabled: boolean | undefined) =>
      renderToStaticMarkup(
        createElement(
          FeatureProvider,
          {
            shop:
              enabled === undefined
                ? undefined
                : { id: enabled ? "a" : "b", features: { cashback: enabled, maps: true, promotions: false } },
          },
          createElement(Entry),
        ),
      );
    expect(render(undefined)).toBe("");
    expect(render(false)).toBe("");
    expect(render(true)).toContain("Кешбэк");
    expect(render(false)).toBe("");
    expect(renderToStaticMarkup(createElement(Entry))).toBe("");
  });
});
