import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import type { ShopInfo } from "../../src/shared/contracts/shop";
import type { AuthSecrets } from "../auth/config";
import type { CommandVariables } from "../middleware/idempotency";

export type ShopEnv = {
  Bindings: { shop: ShopInfo; db: DrizzleSqliteDODatabase; storage: DurableObjectStorage; secrets: AuthSecrets };
  Variables: CommandVariables;
};
