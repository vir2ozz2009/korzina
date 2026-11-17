import { createMiddleware } from "hono/factory";
import { ApiError } from "../../src/shared/errors";
import { type FeatureKey, featureEnabled } from "../../src/shared/flags";
import { readFeatures } from "../platform/features";

type FeatureEnv = { Bindings: { shop: { id: string }; platform: D1Database } };

export function requireFeature(key: FeatureKey) {
  return createMiddleware<FeatureEnv>(async (c, next) => {
    const features = await readFeatures(c.env.platform, c.env.shop.id);
    if (!featureEnabled(features, key)) throw new ApiError("FEATURE_DISABLED", "Функция не подключена");
    await next();
  });
}
