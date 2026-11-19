import { Hono } from "hono";
import { handleError, notFound } from "../middleware/errors";
import { requireFeature } from "../middleware/feature";
import { RateLimiter, rateLimit } from "../middleware/rate-limit";
import { customerAuth } from "../modules/auth/routes";
import { cartRoutes } from "../modules/cart/routes";
import { catalogRoutes } from "../modules/catalog/routes";
import { buyerOrderRoutes } from "../modules/checkout/buyer-order-routes";
import { purchaseRoutes } from "../modules/checkout/routes";
import { diagnostics } from "../modules/diagnostics/routes";
import { favoritesRoutes } from "../modules/favorites/routes";
import { receivingRoutes } from "../modules/fulfillment/routes";
import { mediaRoutes } from "../modules/media/routes";
import { revisionResponse } from "../revisions";
import type { ShopEnv } from "./env";
import { readPublicSettings } from "./public-settings";

export function shopRoutes() {
  return (
    new Hono<ShopEnv>()
      .onError(handleError)
      .use(
        "*",
        rateLimit(new RateLimiter(), (request) => request.headers.get("x-korzina-client") ?? "local"),
      )
      .get("/shop", async (c) => {
        const settings = readPublicSettings(c.env.db);
        return c.json({
          ...c.env.shop,
          name: settings.name ?? c.env.shop.name,
          theme: settings.theme,
          features: c.env.features,
        });
      })
      .route("/auth", customerAuth)
      .route("/cart", cartRoutes)
      .route("/receiving", receivingRoutes)
      .route("/", purchaseRoutes)
      .route("/orders", buyerOrderRoutes)
      .route("/favorites", favoritesRoutes)
      .route("/catalog", catalogRoutes)
      .route("/media", mediaRoutes)
      // Demo/localhost-only availability probe, not the cashback product (A4).
      .get("/diagnostics/features/cashback", requireFeature("cashback"), (c) =>
        c.json({ feature: "cashback", enabled: true }),
      )
      .get("/diagnostics/revision", (c) => revisionResponse(c.req.raw, 1, () => ({ ok: true })))
      .route("/diagnostics", diagnostics)
      .notFound(notFound)
  );
}
