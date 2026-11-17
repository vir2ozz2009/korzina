import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { handleError, notFound } from "../middleware/errors";
import { requireFeature } from "../middleware/feature";
import { RateLimiter, rateLimit } from "../middleware/rate-limit";
import { customerAuth } from "../modules/auth/routes";
import { diagnostics } from "../modules/diagnostics/routes";
import { readFeatures } from "../platform/features";
import { revisionResponse } from "../revisions";
import type { ShopEnv } from "./env";
import { settings } from "./schema";

export function shopRoutes() {
  return (
    new Hono<ShopEnv>()
      .onError(handleError)
      .use(
        "*",
        rateLimit(new RateLimiter(), (request) => request.headers.get("x-korzina-client") ?? "local"),
      )
      .get("/shop", async (c) => {
        const displayName = c.env.db
          .select({ value: settings.value })
          .from(settings)
          .where(eq(settings.key, "display_name"))
          .get();
        return c.json({
          ...c.env.shop,
          name: displayName?.value ?? c.env.shop.name,
          features: await readFeatures(c.env.platform, c.env.shop.id),
        });
      })
      .route("/auth", customerAuth)
      // Demo/localhost-only availability probe, not the cashback product (A4).
      .get("/diagnostics/features/cashback", requireFeature("cashback"), (c) =>
        c.json({ feature: "cashback", enabled: true }),
      )
      .get("/diagnostics/revision", (c) => revisionResponse(c.req.raw, 1, () => ({ ok: true })))
      .route("/diagnostics", diagnostics)
      .notFound(notFound)
  );
}
