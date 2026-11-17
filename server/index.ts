import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { ApiError, errorBody } from "../src/shared/errors";
import type { AuthSecrets } from "./auth/config";
import { handleError, notFound } from "./middleware/errors";
import { apiMetrics } from "./middleware/metrics";
import { RateLimiter, rateLimit } from "./middleware/rate-limit";
import { requestId } from "./middleware/request-id";
import { sellerAccess } from "./platform/auth/access-routes";
import { platformAuth } from "./platform/auth/routes";
import { resolveShop } from "./platform/resolve-shop";
import { shopRoutes } from "./shop/routes";

export { Shop } from "./shop/Shop";

const forwarding = createMiddleware<{ Bindings: Env }>(async (c) => {
  const shop = await resolveShop(c.req.raw, c.env.PLATFORM);
  if (!shop) return c.json(errorBody(new ApiError("SHOP_NOT_FOUND", "Магазин не найден")), 404);
  if (
    c.req.path.startsWith("/api/diagnostics") &&
    !["demo.korzina.app", "localhost", "127.0.0.1", "[::1]"].includes(new URL(c.req.url).hostname)
  ) {
    return notFound(c);
  }
  const headers = new Headers(c.req.raw.headers);
  headers.set("x-korzina-shop", encodeURIComponent(JSON.stringify(shop)));
  headers.set("x-korzina-client", c.req.header("CF-Connecting-IP") ?? "local");
  headers.set("x-request-id", c.res.headers.get("X-Request-Id") ?? crypto.randomUUID());
  const upstream = await c.env.SHOP.get(c.env.SHOP.idFromName(shop.id)).fetch(new Request(c.req.raw, { headers }));
  const response = new Response(upstream.body, upstream);
  response.headers.set("Cache-Control", "no-store");
  return response;
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
  .route("/platform/auth", platformAuth)
  .route("/seller/access", sellerAccess)
  .use("/auth/*", forwarding)
  .use("/shop", forwarding)
  .use("/diagnostics/*", forwarding)
  .route("/", shopRoutes())
  .notFound(notFound);

export type AppType = typeof app;
export default app;
