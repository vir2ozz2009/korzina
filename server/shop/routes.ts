import { eq } from "drizzle-orm";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { Hono } from "hono";
import type { ShopInfo } from "../../src/shared/contracts/shop";
import { handleError, notFound } from "../middleware/errors";
import type { CommandVariables } from "../middleware/idempotency";
import { RateLimiter, rateLimit } from "../middleware/rate-limit";
import { diagnostics } from "../modules/diagnostics/routes";
import { revisionResponse } from "../revisions";
import { settings } from "./schema";

export type ShopEnv = {
  Bindings: { shop: ShopInfo; db: DrizzleSqliteDODatabase; storage: DurableObjectStorage };
  Variables: CommandVariables;
};
export function shopRoutes() {
  return new Hono<ShopEnv>()
    .onError(handleError)
    .use(
      "*",
      rateLimit(new RateLimiter(), (request) => request.headers.get("x-korzina-client") ?? "local"),
    )
    .get("/shop", (c) => {
      const displayName = c.env.db
        .select({ value: settings.value })
        .from(settings)
        .where(eq(settings.key, "display_name"))
        .get();
      return c.json({ ...c.env.shop, name: displayName?.value ?? c.env.shop.name });
    })
    .get("/diagnostics/revision", (c) => revisionResponse(c.req.raw, 1, () => ({ ok: true })))
    .route("/diagnostics", diagnostics)
    .notFound(notFound);
}
