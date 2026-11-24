import { Hono } from "hono";
import { handleError, notFound } from "../middleware/errors";
import { requireFeature } from "../middleware/feature";
import { customerAuth } from "../modules/auth/routes";
import { cartRoutes } from "../modules/cart/routes";
import { catalogRoutes } from "../modules/catalog/routes";
import { buyerOrderRoutes } from "../modules/checkout/buyer-order-routes";
import { purchaseRoutes } from "../modules/checkout/routes";
import { sellerPaymentRoutes } from "../modules/checkout/seller-payment-routes";
import { diagnostics } from "../modules/diagnostics/routes";
import { favoritesRoutes } from "../modules/favorites/routes";
import { pauseStatus } from "../modules/fulfillment/pause";
import { receivingRoutes } from "../modules/fulfillment/routes";
import { sellerReceivingRoutes } from "../modules/fulfillment/seller-routes";
import { resolveFulfillment } from "../modules/fulfillment/service";
import { storefrontReceiving } from "../modules/fulfillment/storefront-receiving";
import { mediaRoutes } from "../modules/media/routes";
import { buyerChatRoutes, sellerChatRoutes } from "../modules/order-chat/routes";
import { profileRoutes } from "../modules/profile/routes";
import { sellerCatalogRoutes } from "../modules/seller-catalog/routes";
import { sellerOrderRoutes } from "../modules/seller-orders/routes";
import { sellerSalesRoutes } from "../modules/seller-sales/routes";
import { revisionResponse } from "../revisions";
import type { ShopEnv } from "./env";
import { readPublicSettings } from "./public-settings";
import { sellerProfileRoutes } from "./seller-profile-routes";

export function shopRoutes() {
  return (
    new Hono<ShopEnv>()
      .onError(handleError)
      // Public ingress is rate-limited by the Worker. A catalog page may make several private Shop reads.
      .get("/shop", async (c) => {
        const settings = readPublicSettings(c.env.db);
        const fulfillment = resolveFulfillment(settings.fulfillment, c.env.features.maps);
        const now = Date.now();
        const receiving =
          c.req.query("receiving") === "1" && c.env.shop.status !== "paused"
            ? storefrontReceiving(c.env.storage, c.env.features.maps, settings.timeZone, now, fulfillment)
            : undefined;
        const banners = receiving?.banners ?? pauseStatus(fulfillment, settings.timeZone, now).banners;
        return c.json({
          ...c.env.shop,
          name: settings.name ?? c.env.shop.name,
          theme: settings.theme,
          timeZone: settings.timeZone,
          profile: settings.profile,
          orderBanners: banners.length ? banners : undefined,
          receiving,
          features: c.env.features,
        });
      })
      .route("/auth", customerAuth)
      .route("/cart", cartRoutes)
      .route("/receiving", receivingRoutes)
      .route("/", purchaseRoutes)
      .route("/orders/chat", buyerChatRoutes)
      .route("/orders", buyerOrderRoutes)
      .route("/seller/catalog", sellerCatalogRoutes)
      .route("/seller/orders", sellerOrderRoutes)
      .route("/seller/chat", sellerChatRoutes)
      .route("/seller/receiving", sellerReceivingRoutes)
      .route("/seller/payments", sellerPaymentRoutes)
      .route("/seller/profile", sellerProfileRoutes)
      .route("/seller/statistics", sellerSalesRoutes)
      .route("/favorites", favoritesRoutes)
      .route("/profile", profileRoutes)
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
