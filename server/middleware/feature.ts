import { createMiddleware } from "hono/factory";
import { ApiError } from "../../src/shared/errors";
import { type FeatureKey, type FeatureState, featureEnabled } from "../../src/shared/flags";

type FeatureEnv = { Bindings: { features: FeatureState } };

export function requireFeature(key: FeatureKey) {
  return createMiddleware<FeatureEnv>(async (c, next) => {
    if (!featureEnabled(c.env.features, key)) throw new ApiError("FEATURE_DISABLED", "Функция не подключена");
    await next();
  });
}
