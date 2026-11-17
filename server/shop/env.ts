import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import type { ShopInfo } from "../../src/shared/contracts/shop";
import type { FeatureState } from "../../src/shared/flags";
import type { AuthSecrets } from "../auth/config";
import type { CommandVariables } from "../middleware/idempotency";

export type ShopEnv = {
  Bindings: {
    shop: ShopInfo;
    features: FeatureState;
    db: DrizzleSqliteDODatabase;
    storage: DurableObjectStorage;
    secrets: AuthSecrets;
    platform: D1Database;
  };
  Variables: CommandVariables;
};
