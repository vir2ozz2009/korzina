import { exports } from "cloudflare:workers";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import type { AuthSecrets } from "./auth/config";
import { scheduledBackup } from "./backup/service";
import { isDevelopmentHost } from "./development";
import { serveHtml } from "./html";
import { handleError, notFound } from "./middleware/errors";
import { apiMetrics } from "./middleware/metrics";
import { apiRateLimit } from "./middleware/rate-limit";
import { requestId } from "./middleware/request-id";
import { guestCart } from "./modules/cart/guest";
import { catalogGateway } from "./modules/catalog/gateway";
import { localPublicMedia } from "./modules/media/local-public";
import { publicShop } from "./platform/admin/public-shop";
import { adminRoutes } from "./platform/admin/routes";
import { sellerAccess } from "./platform/auth/access-routes";
import { cabinetRoutes } from "./platform/auth/cabinet-routes";
import { platformAuth } from "./platform/auth/routes";
import { shopWebhook } from "./platform/auth/shop-webhook";
import { launchRoutes } from "./platform/launch-routes";
import { sellerOrderGateway } from "./platform/seller-order-gateway";
import { shopContexts } from "./platform/shop-context";
import { authorizeBuyerShop } from "./platform/shop-preview";
import { teamRoutes } from "./platform/team/routes";
import { forwardToShop } from "./shop/forward";
import { shopRoutes } from "./shop/routes";

export { RestoreShop } from "./backup/RestoreShop";
export { Shop } from "./shop/Shop";

const forwarding = createMiddleware<{ Bindings: Env }>(async (c) => {
  if (
    c.req.path.startsWith("/api/diagnostics") &&
    (c.env.APP_ENV === "production" || !isDevelopmentHost(new URL(c.req.url).hostname))
  ) {
    return notFound(c);
  }
  const shop = await shopContexts.read(c.req.raw, c.env, c.req.path === "/api/checkout" && c.req.method === "POST");
  const teamPreview = await authorizeBuyerShop(c.req.raw, c.env.PLATFORM, shop);
  return forwardToShop(c, { ...shop, teamPreview });
});

// Routing and validation types come from the SAME DO router; no manually duplicated RPC signatures.
export const app = new Hono<{ Bindings: Env & AuthSecrets }>()
  .basePath("/api")
  .onError(handleError)
  .use("*", requestId)
  .use("*", apiMetrics)
  .use("*", apiRateLimit)
  .get("/health", (c) => c.json({ ok: true }))
  .get("/media-public/:shop/:id/:name", (c) =>
    localPublicMedia(c.req.raw, c.env, c.req.param("shop"), c.req.param("id"), c.req.param("name")),
  )
  .route("/platform/auth", platformAuth)
  .route("/platform/admin", adminRoutes)
  .route("/platform/shop-telegram", shopWebhook)
  .route("/platform/storefront", publicShop)
  .route("/seller/access", sellerAccess)
  .route("/seller/cabinet", cabinetRoutes)
  .route("/seller/launch", launchRoutes)
  .route("/seller/team", teamRoutes)
  .get("/shop", async (c) => {
    c.header("Cache-Control", "no-store");
    const shop = await shopContexts.read(c.req.raw, c.env, false, true, c.req.query("receiving") === "1");
    const teamPreview = await authorizeBuyerShop(c.req.raw, c.env.PLATFORM, shop);
    return c.json(teamPreview ? { ...shop, teamPreview } : shop);
  })
  .use("/auth/*", forwarding)
  .use("/cart", guestCart)
  .use("/cart/*", forwarding)
  .use("/receiving/*", forwarding)
  .use("/quote", forwarding)
  .use("/checkout/*", forwarding)
  .use("/orders/*", forwarding)
  .use("/seller/catalog/*", sellerOrderGateway)
  .use("/seller/orders/*", sellerOrderGateway)
  .use("/seller/promotions/*", sellerOrderGateway)
  .use("/seller/money/*", sellerOrderGateway)
  .use("/seller/chat/*", sellerOrderGateway)
  .use("/seller/receiving/*", sellerOrderGateway)
  .use("/seller/payments/*", sellerOrderGateway)
  .use("/seller/profile/*", sellerOrderGateway)
  .use("/seller/statistics/*", sellerOrderGateway)
  .use("/favorites/*", forwarding)
  .use("/profile/*", forwarding)
  .use("/media/*", (c, next) =>
    c.req.query("as") === "seller" && c.req.query("store") ? sellerOrderGateway(c, next) : forwarding(c, next),
  )
  .use("/catalog/*", catalogGateway)
  .use("/shop", forwarding)
  .use("/diagnostics/*", forwarding)
  .route("/", shopRoutes())
  .notFound(notFound);

export type AppType = typeof app;
export default {
  scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(scheduledBackup(env, exports, event.scheduledTime));
  },
  fetch(request: Request, env: Env & AuthSecrets, ctx: ExecutionContext) {
    return new URL(request.url).pathname.startsWith("/api/") || new URL(request.url).pathname === "/api"
      ? app.fetch(request, env, ctx)
      : serveHtml(request, env);
  },
};
