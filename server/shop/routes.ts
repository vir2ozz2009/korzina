import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { handleError, notFound } from "../middleware/errors";
import { RateLimiter, rateLimit } from "../middleware/rate-limit";
import { customerAuth } from "../modules/auth/routes";
import { diagnostics } from "../modules/diagnostics/routes";
import { revisionResponse } from "../revisions";
import type { ShopEnv } from "./env";
import { settings } from "./schema";

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
    .route("/auth", customerAuth)
    .get("/diagnostics/revision", (c) => revisionResponse(c.req.raw, 1, () => ({ ok: true })))
    .route("/diagnostics", diagnostics)
    .notFound(notFound);
}
