export type FlagDefinition = {
  key: string;
  kind: "addon" | "rollout";
  default: boolean;
  description: string;
};

// A4 implements cashback; F5 registers its availability only, without money or product behavior.
export const flags = [
  { key: "cashback", kind: "addon", default: false, description: "Кешбэк (A4)" },
  { key: "promotions", kind: "addon", default: false, description: "Акции (12)" },
  { key: "maps", kind: "rollout", default: true, description: "Карта и геокодер витрины (B7)" },
] as const satisfies readonly FlagDefinition[];

export type FeatureKey = (typeof flags)[number]["key"];
export type FeatureState = Readonly<Record<FeatureKey, boolean>>;
export type FeatureOverride = { key: string; enabled: boolean };

export function isFeatureKey(key: string): key is FeatureKey {
  return flags.some((flag) => flag.key === key);
}

export function resolveFeatures(overrides: readonly FeatureOverride[]): FeatureState;
export function resolveFeatures(
  overrides: readonly FeatureOverride[],
  registry: readonly FlagDefinition[],
): Readonly<Record<string, boolean>>;
export function resolveFeatures(
  overrides: readonly FeatureOverride[],
  registry: readonly FlagDefinition[] = flags,
): Readonly<Record<string, boolean>> {
  const enabled = new Map(overrides.map((row) => [row.key, row.enabled]));
  return Object.fromEntries(
    registry.map((flag) => [flag.key, enabled.get(flag.key) ?? (flag.kind === "addon" ? false : flag.default)]),
  );
}

export function featureEnabled(features: FeatureState | undefined, key: FeatureKey): boolean {
  return isFeatureKey(key) && features?.[key] === true;
}
