import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { type FeatureKey, featureEnabled, flags, resolveFeatures } from "./flags";
import { FeatureProvider, useFeature } from "./useFeature";

function Entry() {
  return useFeature("cashback") ? createElement("a", { href: "/cashback" }, "Кешбэк") : null;
}

describe("реестр функций и клиент", () => {
  it("addon по умолчанию выключен, включая ошибочный default: true; core не зарегистрирован", () => {
    expect(resolveFeatures([])).toEqual({ cashback: false });
    expect(resolveFeatures([], [{ key: "addon", kind: "addon", default: true, description: "test" }])).toEqual({
      addon: false,
    });
    expect(flags.some((flag) => String(flag.key) === "catalog")).toBe(false);
    expect(featureEnabled({ cashback: true }, "unknown" as FeatureKey)).toBe(false);
    expect(resolveFeatures([{ key: "removed", enabled: true }])).toEqual({ cashback: false });
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
            shop: enabled === undefined ? undefined : { id: enabled ? "a" : "b", features: { cashback: enabled } },
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
