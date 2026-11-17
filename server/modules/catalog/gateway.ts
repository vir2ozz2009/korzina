import { exports } from "cloudflare:workers";
import { createMiddleware } from "hono/factory";
import { catalogPageInput } from "../../../src/shared/contracts/catalog";
import { ApiError } from "../../../src/shared/errors";
import { resolveShop } from "../../platform/resolve-shop";
import { cachedDocument } from "./cache";

export const catalogGateway = createMiddleware<{ Bindings: Env }>(async (c) => {
  const shop = await resolveShop(c.req.raw, c.env.PLATFORM, c.env.APP_ENV);
  if (!shop) throw new ApiError("SHOP_NOT_FOUND", "Магазин не найден");
  const load = async () => {
    const headers = new Headers(c.req.raw.headers);
    headers.set("x-korzina-shop", encodeURIComponent(JSON.stringify(shop)));
    headers.set("x-korzina-client", c.req.header("CF-Connecting-IP") ?? "local");
    headers.set("x-request-id", c.res.headers.get("X-Request-Id") ?? crypto.randomUUID());
    const response = await exports.Shop.get(exports.Shop.idFromName(shop.id)).fetch(
      new Request(c.req.raw, { headers }),
    );
    const result = new Response(response.body, response);
    result.headers.set("Cache-Control", "no-store");
    return result;
  };
  if (c.req.method === "GET" && c.req.path === "/api/catalog/document") {
    const parsed = catalogPageInput.safeParse(c.req.query());
    if (!parsed.success) throw new ApiError("VALIDATION", "Некорректные параметры каталога");
    return cachedDocument(c.req.raw, parsed.data, c.env.APP_ENV, shop.id, load);
  }
  return load();
});
