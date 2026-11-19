import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import type { AuthSecrets } from "./auth/config";
import { isDevelopmentHost } from "./development";
import { serveHtml } from "./html";
import { handleError, notFound } from "./middleware/errors";
import { apiMetrics } from "./middleware/metrics";
import { RateLimiter, rateLimit } from "./middleware/rate-limit";
import { requestId } from "./middleware/request-id";
import { guestCart } from "./modules/cart/guest";
import { catalogGateway } from "./modules/catalog/gateway";
import { localPublicMedia } from "./modules/media/local-public";
import { sellerAccess } from "./platform/auth/access-routes";
import { cabinetRoutes } from "./platform/auth/cabinet-routes";
import { platformWebhook } from "./platform/auth/platform-webhook";
import { platformAuth } from "./platform/auth/routes";
import { shopContexts } from "./platform/shop-context";
import { forwardToShop } from "./shop/forward";
import { shopRoutes } from "./shop/routes";

export { Shop } from "./shop/Shop";

const forwarding = createMiddleware<{ Bindings: Env }>(async (c) => {
  if (
    c.req.path.startsWith("/api/diagnostics") &&
    (c.env.APP_ENV === "production" || !isDevelopmentHost(new URL(c.req.url).hostname))
  ) {
    return notFound(c);
  }
  const shop = await shopContexts.read(c.req.raw, c.env);
  return forwardToShop(c, shop);
});

// Routing and validation types come from the SAME DO router; no manually duplicated RPC signatures.
export const app = new Hono<{ Bindings: Env & AuthSecrets }>()
  .basePath("/api")
  .onError(handleError)
  .use("*", requestId)
  .use("*", apiMetrics)
  .use(
    "*",
    rateLimit(new RateLimiter(), (request) => request.headers.get("CF-Connecting-IP") ?? "local"),
  )
  .get("/health", (c) => c.json({ ok: true }))
  .get("/media-public/:shop/:id/:name", (c) =>
    localPublicMedia(c.req.raw, c.env, c.req.param("shop"), c.req.param("id"), c.req.param("name")),
  )
  .route("/platform/auth", platformAuth)
  .route("/platform/telegram", platformWebhook)
  .route("/seller/access", sellerAccess)
  .route("/seller/cabinet", cabinetRoutes)
  .get("/shop", async (c) => {
    c.header("Cache-Control", "no-store");
    return c.json(await shopContexts.read(c.req.raw, c.env));
  })
  .use("/auth/*", forwarding)
  .use("/cart", guestCart)
  .use("/cart", forwarding)
  .use("/receiving/*", forwarding)
  .use("/quote", forwarding)
  .use("/checkout/*", forwarding)
  .use("/orders/*", forwarding)
  .use("/favorites/*", forwarding)
  .use("/profile/*", forwarding)
  .use("/media/*", forwarding)
  .use("/catalog/*", catalogGateway)
  .use("/shop", forwarding)
  .use("/diagnostics/*", forwarding)
  .route("/", shopRoutes())
  .notFound(notFound);

export type AppType = typeof app;
export default {
  fetch(request: Request, env: Env & AuthSecrets, ctx: ExecutionContext) {
    return new URL(request.url).pathname.startsWith("/api/") || new URL(request.url).pathname === "/api"
      ? app.fetch(request, env, ctx)
      : serveHtml(request, env);
  },
};
