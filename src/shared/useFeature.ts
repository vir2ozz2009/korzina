import { createContext, createElement, type ReactNode, useContext } from "react";
import { type FeatureKey, type FeatureState, featureEnabled } from "./flags";

const FeatureContext = createContext<FeatureState | undefined>(undefined);

// The app shell supplies the CURRENT /api/shop response; no extra request or browser-wide state.
export function FeatureProvider({
  shop,
  children,
}: {
  shop: { id: string; features: FeatureState } | undefined;
  children?: ReactNode;
}) {
  return createElement(FeatureContext.Provider, { value: shop?.features }, children);
}

export function useFeature(key: FeatureKey): boolean {
  return featureEnabled(useContext(FeatureContext), key);
}
