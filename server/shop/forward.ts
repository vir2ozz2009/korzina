import { exports } from "cloudflare:workers";
import type { ShopInfo } from "../../src/shared/contracts/shop";
import type { ShopContext } from "../../src/shared/contracts/shop-context";
import type { FeatureState } from "../../src/shared/flags";

type ForwardRequest = { req: { raw: Request }; res?: Response };
export async function forwardToShop(
  c: ForwardRequest,
  context: ShopInfo & { features: FeatureState; adminSettings?: ShopContext["adminSettings"] },
) {
  const headers = new Headers(c.req.raw.headers);
  headers.set("x-korzina-shop", encodeURIComponent(JSON.stringify(context)));
  headers.set("x-korzina-client", c.req.raw.headers.get("CF-Connecting-IP") ?? "local");
  headers.set("x-request-id", c.res?.headers.get("X-Request-Id") ?? crypto.randomUUID());
  const upstream = await exports.Shop.get(exports.Shop.idFromName(context.id)).fetch(
    new Request(c.req.raw, { headers }),
  );
  const response = new Response(upstream.body, upstream);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
