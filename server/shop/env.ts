import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import type { ShopInfo } from "../../src/shared/contracts/shop";
import type { FeatureState } from "../../src/shared/flags";
import type { AuthSecrets } from "../auth/config";
import type { CommandVariables } from "../middleware/idempotency";

export type ShopEnv = {
  Bindings: {
    shop: ShopInfo;
    timeZone?: string;
    features: FeatureState;
    db: DrizzleSqliteDODatabase;
    storage: DurableObjectStorage;
    object: DurableObjectState;
    matchedRoute?: (path: string) => void;
    secrets: AuthSecrets;
    platform: D1Database;
    media: Pick<Env, "MEDIA" | "MEDIA_PUBLIC" | "IMAGES" | "MEDIA_PUBLIC_URL">;
  };
  Variables: CommandVariables;
};
